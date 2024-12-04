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

var startScreenCasting = function(castDeviceIndexes) {

    // todo remove old chunks after 1m or later
    // todo try h256 (for mp4)
    const ffmpegProcess = spawn(
        ffmpeg,
        // hls
        [
            "-f", "avfoundation",
            "-y",
            "-i", castDeviceIndexes,
            "-c:v", "libx264",
            // "-level:v", "4.2", "-b:v", "2000k",
            "-c:a", "aac",
            "-r", "25",
            "-pix_fmt", "yuv420p",
            "-preset", "veryfast", //ultrafast,superfast,veryfast,faster,fast,medium,slow,slower,veryslow\

            // "-streaming", "1",
            "-hls_time", "2",
            "-hls_list_size", "40",
            // "-hls_playlist_type", "event",
            "-hls_segment_filename", "screencast_seg_%03d.ts",
            "-hls_flags", "split_by_time+delete_segments+omit_endlist+append_list",
            "-f", "hls",
            "capture.m3u8"
        ],
        {stdio: "pipe"}
    );

    ffmpegProcess.stderr.pipe(process.stderr);
    ffmpegProcess.stdout.pipe(process.stdout);

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
        var s = fs.createReadStream(req.url.replace("/", ""));
        s.on('open', function () {
            res.setHeader("Content-Type", type)
            res.setHeader("Access-Control-Allow-Origin", "*")
            s.pipe(res);
        });
        s.on('error', function () {
            res.statusCode = 404
        });
    }).listen(port);

    debug('started webserver for screencast on address %s using port %s', ip, port);
    next();
};

module.exports = screen;
