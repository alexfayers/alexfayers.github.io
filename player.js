(function () {
  var START_TIMEOUT = 15000;
  var AUTOPLAY_GRACE = 3000;
  var POLL = 250;
  var PLAY_LABEL = "Play a random track by BIRDSTARE";
  var UI = {
    autoplay: ["idle", "Tuning in", "Play", PLAY_LABEL],
    starting: ["starting", "Starting up", "Play", PLAY_LABEL],
    playing: ["playing", "", "Pause", "Pause music"],
    paused: ["paused", "", "Play", PLAY_LABEL],
    blocked: ["blocked", "Your browser blocked autoplay", "Press play", PLAY_LABEL],
    failed: ["failed", "Couldn't start that track", "Retry", "Try starting the music again"]
  };
  var plays = document.querySelectorAll('[data-act="play"]');
  var nexts = document.querySelectorAll('[data-act="next"]');
  var radio = document.getElementById("radio");
  var slap = document.getElementById("slap");
  var heading = slap.querySelector("b");
  var title = slap.querySelector(".title");
  var status = document.getElementById("now");
  var tracks = JSON.parse(plays[0].dataset.tracks);
  var origin = "https://www.youtube-nocookie.com";
  var frame = null;
  var mode = "autoplay";
  var ready = false;
  var queue = [];
  var poll = 0;
  var timer = 0;
  var buffering = false;
  var bad = {};
  var index = -1;
  var started = false;
  var inView = true;

  function place() {
    slap.hidden = !(started && !inView);
  }

  function setMode(next, text) {
    var ui = UI[next];
    var on = next === "playing";
    mode = next;
    started = started || on;
    radio.dataset.state = slap.dataset.state = ui[0];
    if (next === "starting") radio.setAttribute("aria-busy", "true");
    else radio.removeAttribute("aria-busy");
    heading.textContent = on ? "On air" : "Off air";
    title.textContent = tracks[index][1];
    status.textContent = text || ui[1] || (on ? "Now playing: " : "Paused: ") + tracks[index][1];
    plays.forEach(function (button) {
      button.dataset.state = on ? "playing" : "paused";
      button.querySelector("span").textContent = ui[2];
      button.setAttribute("aria-label", ui[3]);
    });
    place();
  }

  function fail(text) {
    clearTimeout(timer);
    setMode("failed", text);
  }

  function block() {
    if (mode === "autoplay") setMode("blocked");
  }

  function autoplayCheck() {
    if (mode !== "autoplay") return;
    if (buffering) timer = setTimeout(function () { if (mode === "autoplay") fail(); }, START_TIMEOUT - AUTOPLAY_GRACE);
    else block();
  }

  function post(message) {
    message.id = 1;
    message.channel = "widget";
    frame.contentWindow.postMessage(JSON.stringify(message), origin);
  }

  function listen() {
    post({ event: "listening" });
  }

  function send(func, args) {
    var message = { event: "command", func: func, args: args || [] };
    if (ready) post(message);
    else queue.push(message);
  }

  function pick() {
    var open = [];
    var i;
    for (i = 0; i < tracks.length; i++) if (!bad[i] && i !== index) open.push(i);
    if (!open.length && !bad[index]) open.push(index);
    return open.length ? open[Math.floor(Math.random() * open.length)] : -1;
  }

  function load(i) {
    index = i;
    send("loadVideoById", [tracks[i][0]]);
  }

  function userStart(func, args) {
    clearTimeout(timer);
    setMode("starting");
    send(func, args);
    timer = setTimeout(fail, START_TIMEOUT);
  }

  function next() {
    var i = pick();
    if (i < 0) {
      bad = {};
      i = pick();
    }
    index = i;
    userStart("loadVideoById", [tracks[i][0]]);
  }

  function skip() {
    var i;
    bad[index] = true;
    i = pick();
    if (i < 0) return fail("Couldn't play any tracks right now");
    load(i);
    clearTimeout(timer);
    if (mode === "autoplay") {
      buffering = false;
      timer = setTimeout(autoplayCheck, AUTOPLAY_GRACE);
    } else {
      setMode("starting");
      timer = setTimeout(fail, START_TIMEOUT);
    }
  }

  function onReady() {
    ready = true;
    clearInterval(poll);
    send("addEventListener", ["onStateChange"]);
    send("addEventListener", ["onError"]);
    queue.splice(0).forEach(post);
    if (mode === "autoplay") {
      clearTimeout(timer);
      timer = setTimeout(autoplayCheck, AUTOPLAY_GRACE);
    }
  }

  function onState(state) {
    if (state === 1) {
      clearTimeout(timer);
      setMode("playing");
    } else if (mode === "autoplay") buffering = state === 3;
    else if (state === 0 && mode === "playing") next();
    else if (state === 2 && mode === "playing") setMode("paused");
  }

  function open() {
    index = pick();
    frame = document.createElement("iframe");
    frame.className = "yt";
    frame.title = "BIRDSTARE audio player";
    frame.tabIndex = -1;
    frame.allow = "autoplay";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.src = origin + "/embed/" + tracks[index][0] + "?enablejsapi=1&autoplay=1&playsinline=1&origin=" + encodeURIComponent(location.origin);
    frame.addEventListener("load", listen);
    document.body.appendChild(frame);
    poll = setInterval(listen, POLL);
    timer = setTimeout(function () { if (mode === "autoplay") fail(); }, START_TIMEOUT);
    setMode("autoplay");
  }

  window.addEventListener("message", function (e) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== origin) return;
    var data;
    try { data = JSON.parse(e.data); } catch (err) { return; }
    var running = mode === "autoplay" || mode === "starting" || mode === "playing";
    if (data.event === "readyToListen") listen();
    else if (!ready && (data.event === "initialDelivery" || data.event === "onReady" || data.event === "alreadyInitialized")) onReady();
    if (!ready) return;
    if (data.event === "onError") {
      if (running) skip();
    } else if (data.event === "onStateChange") onState(data.info);
    else if (data.info && data.info.playerState !== undefined) onState(data.info.playerState);
  });

  nexts.forEach(function (button) {
    button.addEventListener("click", next);
  });

  plays.forEach(function (button) {
    button.addEventListener("click", function () {
      if (mode === "playing") {
        send("pauseVideo");
        setMode("paused");
      } else if (mode === "failed") {
        if (pick() < 0) {
          bad = {};
          index = pick();
        }
        userStart("loadVideoById", [tracks[index][0]]);
      } else userStart("playVideo");
    });
  });

  new IntersectionObserver(function (entries) {
    inView = entries[entries.length - 1].isIntersecting;
    place();
  }).observe(radio);

  open();
})();
