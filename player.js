(function () {
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
  var playing = false;
  var loaded = false;
  var wanted = "";
  var timer = 0;
  var settled = false;
  var blocked = false;
  var started = false;
  var inView = true;
  var current = "";
  var last = -1;
  var errors = 0;

  function place() {
    slap.hidden = !(started && !inView);
  }

  function show(on, state, text) {
    clearTimeout(timer);
    settled = true;
    blocked = false;
    playing = on;
    started = started || on;
    state = state || (on ? "playing" : "paused");
    radio.dataset.state = slap.dataset.state = state;
    heading.textContent = on ? "On air" : "Off air";
    title.textContent = current;
    status.textContent = text || (on ? "Now playing: " : "Paused: ") + current;
    plays.forEach(function (button) {
      button.dataset.state = on ? "playing" : "paused";
      button.querySelector("span").textContent = state === "blocked" ? "Press play" : on ? "Pause" : "Play";
      button.setAttribute("aria-label", on ? "Pause music" : "Play a random track by BIRDSTARE");
    });
    place();
  }

  function block() {
    show(false, "blocked", "Your browser blocked autoplay");
    blocked = true;
  }

  function request(command, args) {
    status.textContent = "Starting up";
    clearTimeout(timer);
    timer = setTimeout(block, 6000);
    if (loaded) send(command, args);
    else wanted = command;
  }

  function pick() {
    var i;
    do { i = Math.floor(Math.random() * tracks.length); } while (i === last && tracks.length > 1);
    last = i;
    current = tracks[i][1];
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
      setTimeout(function () { if (!settled) block(); }, 2500);
      frame.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), origin);
      if (wanted === "loadVideoById") send(wanted, [pick()]);
      else if (wanted) send(wanted);
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
      request("loadVideoById", loaded ? [pick()] : []);
    });
  });

  plays.forEach(function (button) {
    button.addEventListener("click", function () {
      if (playing) { show(false); send("pauseVideo"); }
      else request("playVideo");
    });
  });

  new IntersectionObserver(function (entries) {
    inView = entries[entries.length - 1].isIntersecting;
    place();
  }).observe(radio);

  open();
})();
