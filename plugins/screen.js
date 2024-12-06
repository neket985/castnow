var http = require('http');
var internalIp = require('internal-ip');
const {spawn} = require("child_process");
const ffmpeg = require("ffmpeg-static");
const fs = require("fs");
var debug = require('debug')('castnow:screen');

var screenRegex = /screen\((?<indexes>[\w\d\s]+:[\w\d\s]+)\)/;
var isScreen = function (item) {
    return screenRegex.test(item.path);
};

let screenCastFfmpegArgs = function (castDeviceIndexes) {
    return [
        "-f", "avfoundation",
        "-y",
        "-i", castDeviceIndexes,
    ]
}
let encoderFfmpegArgs = [
    "-c:v", "libx264",
    "-c:a", "aac",
    "-r", "25",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-preset", "fast", //ultrafast,superfast,veryfast,faster,fast,medium,slow,slower,veryslow\
    // "-vf", "scale=1920:-2",
]
let bitrateFfmpegArgs = function (rate) {
    return [
        "-maxrate", rate,
        "-bufsize", rate,
    ]
}
let hlsFfmpegArgs = function (bitrateFolder) {
    return [
        "-start_number", "0",
        "-x264-params", "keyint=1:min-keyint=1:scenecut=0", // Sets the key frame interval low enough to enable 1 second chunk size
        "-reset_timestamps", "1",
        "-hls_time", "2",
        "-hls_list_size", "3",
        // "-hls_enc", "1",
        // "-hls_playlist_type", "event",
        "-hls_segment_filename", bitrateFolder + "/screencast_seg_%03d.ts",
        "-hls_flags", "delete_segments+temp_file+program_date_time+independent_segments",
        "-f", "hls",
        bitrateFolder + "/capture.m3u8"
    ]
}

var clearDirectory = function (path) {
    if (fs.existsSync(path)) {
        fs.rmdirSync(path, {recursive: true})
    }
    fs.mkdirSync(path)
}

var startScreenCasting = function (castDeviceIndexes) {
    // clearDirectory("800k")
    // clearDirectory("1600k")
    clearDirectory("2400k")
    const ffmpegProcess = spawn(
        ffmpeg,
        screenCastFfmpegArgs(castDeviceIndexes)
            // .concat(encoderFfmpegArgs, bitrateFfmpegArgs("800k"), hlsFfmpegArgs("800k"))
            // .concat(encoderFfmpegArgs, bitrateFfmpegArgs("1600k"), hlsFfmpegArgs("1600k"))
            .concat(encoderFfmpegArgs, bitrateFfmpegArgs("2400k"), hlsFfmpegArgs("2400k"))
        ,
        {stdio: "pipe"}
    );

    // ffmpegProcess.stderr.pipe(process.stderr);
    // ffmpegProcess.stdout.pipe(process.stdout);

}

var readFileWithRetries = function (path, onSuccess, onError, timeout = 500, maxTries = 10, tryCount = 0) {
    var s = fs.createReadStream(path);
    s.on('open', function () {
        onSuccess(s);
    });
    s.on('error', function () {
        if (tryCount < maxTries) {
            setTimeout(() => {
                    readFileWithRetries(path, onSuccess, onError, timeout, maxTries, tryCount + 1);
                }, timeout
            );
        } else {
            console.error("Exceed tries while reading " + path + " file")
            onError()
        }
    });
}

var screen = function (ctx, next) {
    debug(ctx.options.playlist);
    if (ctx.mode !== 'launch') return next();
    if (ctx.options.playlist.length != 1 || !isScreen(ctx.options.playlist[0])) return next();

    var castDeviceIndexes = screenRegex.exec(ctx.options.playlist[0].path).groups.indexes
    startScreenCasting(castDeviceIndexes)
    var port = ctx.options['stdin-port'] || 4104;
    var ip = ctx.options.myip || internalIp.v4.sync();

    //override settings
    ctx.options.streamType = "LIVE"
    ctx.options.startTime = null // starts from live position
    ctx.options.media = {duration: -1}

    ctx.options.playlist[0] = {
        path: 'http://' + ip + ':' + port + '/capture.m3u8',
        type: 'video/x-mpegURL'
    };

    http.createServer(function (req, res) {
        debug('received request ' + req.url);
        res.on('finish', function () {
            debug('finish response ' + req.url);
        });
        var type = 'application/x-mpegURL';
        readFileWithRetries(
            req.url.replace("/", ""),
            function (s) {
                // if(req.url.endsWith("m3u8")) {
                //     s.on('data', function (data) {
                //         debug('send response ' + req.url + ' data ' + data.toString());
                //     });
                // }
                res.setHeader("Content-Type", type)
                res.setHeader("Access-Control-Allow-Origin", "*")
                s.pipe(res);
            },
            function () {
                res.statusCode = 404
            },
            500,
            20
        )
    }).listen(port);

    debug('started webserver for screencast on address %s using port %s', ip, port);
    next();
};

module.exports = screen;
