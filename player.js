(function () {
  var plays = document.querySelectorAll('[data-act="play"]');
  var nexts = document.querySelectorAll('[data-act="next"]');
  var sticker = document.getElementById("sticker");
  var heading = sticker.querySelector("b");
  var title = sticker.querySelector(".title");
  var status = document.getElementById("now");
  var tracks = JSON.parse(plays[0].dataset.tracks);
  var origin = "https://www.youtube-nocookie.com";
  var frame = null;
  var playing = false;
  var loaded = false;
  var settled = false;
  var blocked = false;
  var current = "";
  var last = -1;
  var errors = 0;

  function show(on, state, text) {
    settled = true;
    blocked = false;
    playing = on;
    sticker.hidden = false;
    sticker.dataset.state = state || (on ? "playing" : "paused");
    heading.textContent = text || (on ? "Now playing" : "Paused");
    status.textContent = text || heading.textContent + ": " + current;
    plays.forEach(function (button) {
      button.dataset.state = on ? "playing" : "paused";
      button.querySelector("span").textContent = on ? "Pause" : "Play";
      button.setAttribute("aria-label", on ? "Pause music" : "Play a random track by BIRDSTARE");
    });
  }

  function block() {
    if (settled) return;
    show(false, "tap", "Tap to start the music");
    blocked = true;
  }

  function pick() {
    var i;
    do { i = Math.floor(Math.random() * tracks.length); } while (i === last && tracks.length > 1);
    last = i;
    current = title.textContent = tracks[i][1];
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
      setTimeout(block, 2500);
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
    else if (settled && !blocked && (state === 2 || state === 5)) show(false);
  });

  nexts.forEach(function (next) {
    next.addEventListener("click", function () {
      if (!frame) { show(true); open(); }
      else if (loaded) { show(true); send("loadVideoById", [pick()]); }
    });
  });

  plays.forEach(function (button) {
    button.addEventListener("click", function () {
      if (!frame) { show(true); open(); }
      else if (playing) { show(false); send("pauseVideo"); }
      else { show(true); send("playVideo"); }
    });
  });

  document.addEventListener("click", function () {
    if (blocked) { show(true); send("playVideo"); }
  });

  open();
})();
