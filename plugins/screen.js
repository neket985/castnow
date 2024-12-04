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
    "-pix_fmt", "yuv420p",
    "-preset", "fast", //ultrafast,superfast,veryfast,faster,fast,medium,slow,slower,veryslow\
]
let bitrateFfmpegArgs = function(rate){
    return [
        "-maxrate", rate,
        "-bufsize", "1835k",
    ]
}
let hlsFfmpegArgs = function (bitrateFolder) {
    return [
        "-start_number", "0",
        "-x264-params", "keyint=15:min-keyint=15", // Sets the key frame interval low enough to enable 1 second chunk size
        "-hls_time", "1",
        "-hls_list_size", "20",
        // "-hls_enc", "1",
        // "-hls_playlist_type", "event",
        "-hls_segment_filename", bitrateFolder + "/screencast_seg_%03d.ts",
        "-hls_flags", "split_by_time+delete_segments+temp_file",
        "-f", "hls",
        bitrateFolder + "/capture.m3u8"
    ]
}

var clearDirectory = function(path){
    if(fs.existsSync(path)){
        fs.rmdirSync(path, { recursive: true })
    }
    fs.mkdirSync(path)
}

var startScreenCasting = function (castDeviceIndexes) {
    clearDirectory("200k")
    clearDirectory("400k")
    clearDirectory("700k")
    const ffmpegProcess = spawn(
        ffmpeg,
        screenCastFfmpegArgs(castDeviceIndexes)
            .concat(encoderFfmpegArgs, bitrateFfmpegArgs("200k"), hlsFfmpegArgs("200k"))
            .concat(encoderFfmpegArgs, bitrateFfmpegArgs("400k"), hlsFfmpegArgs("400k"))
            .concat(encoderFfmpegArgs, bitrateFfmpegArgs("700k"), hlsFfmpegArgs("700k"))
        ,
        {stdio: "pipe"}
    );

    ffmpegProcess.stderr.pipe(process.stderr);
    ffmpegProcess.stdout.pipe(process.stdout);

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
    ctx.options.playlist[0] = {
        path: 'http://' + ip + ':' + port + '/capture.m3u8',
        type: 'video/x-mpegURL'
    };

    http.createServer(function (req, res) {
        debug('received request ' + req.url);
        var type = 'application/x-mpegURL';
        readFileWithRetries(
            req.url.replace("/", ""),
            function (s) {
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
