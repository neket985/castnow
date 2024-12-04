#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var player = require('chromecast-player')();
var chalk = require('chalk');
var keypress = require('keypress');
var ui = require('playerui')();
var circulate = require('array-loop');
var xtend = require('xtend');
var shuffle = require('array-shuffle');
var debug = require('debug')('castnow');
var debouncedSeeker = require('debounced-seeker');
var mime = require('mime');
var noop = function () {
};

async function createScreencastFile() {
    const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {mediaSource: "screen"}
    });

    const recorder = new MediaRecorder(stream);

    const chunks = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.start();

    recorder.onstop = e => {
        const completeBlob = new Blob(chunks, {type: chunks[0].type});
        console.log("url is " + URL.createObjectURL(completeBlob));
        video.src = URL.createObjectURL(completeBlob);
    };

    setTimeout(function () {
        console.log("Executed after 5 second");
        recorder.stop()
    }, 5_000);
}

// createScreencastFile()

const ffmpeg = require("ffmpeg-static");
const {spawn} = require("child_process");

const ffmpegProcess = spawn(
    ffmpeg,
    // hls
    [
        "-f", "avfoundation",
        "-y",
        "-i", "Capture screen 0:BlackHole 2ch",
        "-c:v", "libx264",
        // "-level:v", "4.2", "-b:v", "2000k",
        "-c:a", "aac",
        "-r", "25",
        "-pix_fmt", "yuv420p",
        "-preset", "veryfast", //ultrafast,superfast,veryfast,faster,fast,medium,slow,slower,veryslow\

        "-f", "mpegts",
        "-"
    ],
    {stdio: "pipe"}
);
const stream = ffmpegProcess.stdout;

ffmpegProcess.stderr.pipe(process.stderr);

const file = fs.createWriteStream("capture.ts");
stream.pipe(file);

// stream.on("data", chunk => {
//     console.log(chunk);
// });
//
