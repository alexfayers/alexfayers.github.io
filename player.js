(function () {
  var button = document.getElementById("play");
  var next = document.getElementById("next");
  var status = document.getElementById("now");
  var label = button.querySelector("span");
  var tracks = JSON.parse(button.dataset.tracks);
  var origin = "https://www.youtube-nocookie.com";
  var frame = null;
  var playing = false;
  var loaded = false;
  var last = -1;
  var errors = 0;

  function show(on) {
    playing = on;
    button.dataset.state = on ? "playing" : "paused";
    label.textContent = on ? "Pause" : "Play";
    button.setAttribute("aria-label", on ? "Pause music" : "Play a random track by BIRDSTARE");
  }

  function pick() {
    var i;
    do { i = Math.floor(Math.random() * tracks.length); } while (i === last && tracks.length > 1);
    last = i;
    status.textContent = "Now playing: " + tracks[i][1];
    return tracks[i][0];
  }

  function send(func, args) {
    frame.contentWindow.postMessage(JSON.stringify({ event: "command", func: func, args: args || [] }), origin);
  }

  function open() {
    frame = document.createElement("iframe");
    frame.className = "yt";
    frame.title = "BIRDSTARE audio player";
    frame.tabIndex = -1;
    frame.allow = "autoplay";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.src = origin + "/embed/" + pick() + "?enablejsapi=1&autoplay=1&playsinline=1&origin=" + encodeURIComponent(location.origin);
    frame.addEventListener("load", function () {
      loaded = true;
      frame.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), origin);
    });
    document.body.appendChild(frame);
  }

  window.addEventListener("message", function (e) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== origin) return;
    var data;
    try { data = JSON.parse(e.data); } catch (err) { return; }
    var state = data.event === "onStateChange" ? data.info : data.info && data.info.playerState;
    if (data.event === "onError" && ++errors >= tracks.length) show(false);
    else if (data.event === "onError" || state === 0) send("loadVideoById", [pick()]);
    else if (state === 1) { errors = 0; show(true); }
    else if (state === 2 || state === 5) show(false);
  });

  next.addEventListener("click", function () {
    if (!frame) { show(true); open(); }
    else if (loaded) { show(true); send("loadVideoById", [pick()]); }
  });

  button.addEventListener("click", function () {
    if (!frame) { show(true); open(); }
    else if (playing) { show(false); send("pauseVideo"); }
    else { show(true); send("playVideo"); }
  });
})();
