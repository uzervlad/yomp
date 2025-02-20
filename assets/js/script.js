const { shell, remote, ipcRenderer: ipc } = require('electron'),
  root = remote.app.getPath('userData').split("\\").join("/"),
  db = require('better-sqlite3-helper'),
  fs = require("fs"),
  child = require('child_process').exec,
  NodeID3 = require('node-id3'),
  os = require('os');

if (!fs.existsSync(`${root}/images`)) fs.mkdirSync(`${root}/images`);
if (!fs.existsSync(`${root}/youtube`)) fs.mkdirSync(`${root}/youtube`);
if (!fs.existsSync(`${root}/full`)) fs.mkdirSync(`${root}/full`);

db({ path: `${root}/database.db`, memory: false, readonly: false, fileMustExist: false, migrate: false });

let isLoaded = false,
  loaded = 0,
  musicStatus = {},
  mini = false,
  fullscreen = 0,
  isLoved = false,
  youtubeRadio = false,
  ytQuery = [],
  radioPlayer,
  first = true,
  ping = false;

window.onload = function () {
  start();
  ipc.send('ready');
  loadSettings();
  checkUpdate(true);
  if (db().query("SELECT * from status")[0].loved == "false") { refresh(); } else { openloved(); }
  discordUpdate();
  app.ver = JSON.parse(fs.readFileSync(`${__dirname}/package.json`).toString()).version;
};

function checkUpdate(auto) {
  let ver = JSON.parse(fs.readFileSync(`${__dirname}/package.json`).toString()).version;
  axios.get(`https://4kc-version.glitch.me/yomp`).then(res => {
    let r = res.data;
    if (ver != r.ver && auto) notify("Update", `New ${r.ver} version available to download, check settings :3`);
    if (ver == r.ver && !auto) notify("Update", `You use latest version :P`);
    if (ver != r.ver && !auto) {
      notify("Update", `New version ${r.ver} started to download c:`);
      let osp = os.platform(),
        arch = os.arch().split("x").join("");
      if (osp.indexOf("win") > -1) osp = "win";
      remote.require("electron-download-manager").download({
        url: r[osp + arch],
        onProgress: (p) => {
          document.getElementById("upda").innerHTML = `UPDATE ${p.progress.toFixed(0)}%`
        }
      }, function (error, info) {
        if (error) { console.log(error); return; }
        notify("Update", `Download update complete :>`);
        child(`${info.filePath.toString().split("\\").join("/")}`, function (err, data) {
          if (err) { console.error(err); return; }
        });
        setTimeout(() => {
          window.close();
        }, 1000)
      });
    }
  })
}

function clearDir(path) {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach(function (file, index) {
      let curPath = path + "/" + file;
      if (fs.lstatSync(curPath).isDirectory()) { deleteFolderRecursive(curPath); } else { fs.unlinkSync(curPath); }
    });
  }
};

function clearPl() {
  M.toast({ html: 'Playlist cleared' });
  clearDir(`${root}/images`);
  clearDir(`${root}/full`);
  clearDir(`${root}/youtube`);
  db().run("DROP TABLE music");
  db().run("DROP TABLE status");
  db().run(`CREATE TABLE IF NOT EXISTS status(dataId INTEGER, realId INTEGER, volume INTEGER, loved VARCHAR(5));`);
  db().run(`CREATE TABLE IF NOT EXISTS music(id INTEGER PRIMARY KEY, title VARCHAR(150), bmid VARCHAR(150), category VARCHAR(150), dir VARCHAR(150) , file VARCHAR(999) , icon VARCHAR(150) , full VARCHAR(150) , loved BOOLEAN , videoId VARCHAR(11));`);
  db().run(`INSERT INTO status(dataId,realId,volume,loved) VALUES(0, 0, 0.1, "false");`);
  refresh();
}

function notify(title, body, bol) {
  if (db().query("SELECT * from settings")[0].notiturn == "false") {
    let icon = "assets/icons/icon.png";
    if (title.toLocaleLowerCase().indexOf("now") > -1 && remote.getCurrentWindow().isFocused()) return;
    if (title.toLocaleLowerCase().indexOf("loved") > -1 && remote.getCurrentWindow().isFocused()) return M.toast({ html: `<i style="margin-right: 10px;" class="fas fa-heart owo ${title.split(" ")[0] == "Added" ? "fav" : ""}"></i> <span>${body}</span>` });
    if (db().query("SELECT * from settings")[0].notiloved == "true" && title.toLocaleLowerCase().indexOf("loved") > -1) return;
    if (db().query("SELECT * from settings")[0].notiadd == "true" && title.toLocaleLowerCase().indexOf("success") > -1) return;
    if (title.toLocaleLowerCase().indexOf("loved") > -1) icon = "assets/icons/notif-icon/i_loved.png";
    if (title.toLocaleLowerCase().indexOf("now") > -1) icon = "assets/icons/notif-icon/i_np.png";
    if (title.toLocaleLowerCase().indexOf("success") > -1) icon = "assets/icons/notif-icon/i_add.png";
    if (title.toLocaleLowerCase().indexOf("error") > -1) icon = "assets/icons/notif-icon/i_error.png";
    if (title.toLocaleLowerCase().indexOf("update") > -1) icon = "assets/icons/notif-icon/i_up.png";
    if (title.toLocaleLowerCase().indexOf("youtube") > -1 && bol) icon = "assets/icons/notif-icon/i_yt_finish.png";
    if (title.toLocaleLowerCase().indexOf("youtube") > -1 && !bol) icon = "assets/icons/notif-icon/i_yt_start.png";
    if (body.length > 60) body = body.substring(0, 57) + "...";
    let noti = new Notification(title, { silent: true, silent: true, body: body, icon: icon });
    if (title.toLocaleLowerCase().indexOf("update") > -1) {
      noti.onclick = () => {
        setsToggle();
      }
    }
    // ipcRenderer.send("notification", {title: title, body: body})
  }
}

function setsSave() {
  db().run("DROP TABLE settings");
  db().run(`CREATE TABLE IF NOT EXISTS settings( notiturn VARCHAR(5),notiloved VARCHAR(5) ,notiadd VARCHAR(5) ,keyplay VARCHAR(99) ,keyrandom VARCHAR(99) ,keylove VARCHAR(99) ,keynext VARCHAR(99) ,keyprev VARCHAR(99) ,keyfocus VARCHAR(99) ,keymini VARCHAR(99) ,keyvolumeup VARCHAR(99) ,keyvolumedown VARCHAR(99) ,keymute VARCHAR(99));`);
  db().run(`INSERT INTO settings(notiturn,notiloved,notiadd,keyplay,keyrandom,keylove,keynext,keyprev,keyfocus,keymini,keyvolumeup,keyvolumedown,keymute) VALUES('${document.getElementById('noti-turn').checked}','${document.getElementById('noti-loved').checked}','${document.getElementById('noti-youtube').checked}','${document.getElementById('key-toggle').value}','${document.getElementById('key-random').value}','${document.getElementById('key-love').value}','${document.getElementById('key-next').value}','${document.getElementById('key-prev').value}','${document.getElementById('key-minioff').value}','${document.getElementById('key-mini').value}','${document.getElementById('key-volup').value}','${document.getElementById('key-voldown').value}','${document.getElementById('key-mute').value}');`);
  remote.app.relaunch();
  remote.app.exit();
}

function setsToggle() {
  $("#settings").toggleClass('openmodal');
  $(".menu-left").removeClass('act-menu');
  $(".shadow").hide();
}

function infoToggle() {
  $("#info").toggleClass('openmodal');
  $(".menu-left").removeClass('act-menu');
  $(".shadow").hide();
}

function openMenu() {
  if (document.getElementsByClassName('menu-left')[0].className.indexOf('act-menu') == -1) {
    document.getElementsByClassName('menu-left')[0].classList.add('act-menu');
    document.getElementsByClassName('shadow')[0].style.display = "block";
  } else {
    document.getElementsByClassName('menu-left')[0].classList.remove('act-menu');
    document.getElementsByClassName('shadow')[0].style.display = "none";
  }
}

function hidetray() {
  remote.getCurrentWindow().minimize();
}

document.getElementById("search").onchange = function (e) {
  if (document.getElementById('pl').classList.length == 2) { app.search(); } else {
    let base = db().query("SELECT * from music");
    if (isLoved) {
      base = [];
      db().query("SELECT * from music").forEach(m => {
        if (m.loved == true) base.push(m);
      })
    }
    if (base.length == 0) return;
    if (document.getElementById("pl").classList.length == 2) return;
    let result = [];
    let input = document.getElementById('search');
    var l = input.value.length;
    if (l > 0) {
      for (var i = 0; i < base.length; i++) {
        let title = base[i].title;
        if (title.toLowerCase().match(input.value.toLowerCase())) {
          result.push(base[i]);
        }
      }
      AP.init({
        playList: result
      });
      loaded = 0;

    } else {
      if (!isLoved) { refresh(); } else { openloved(); }
    }
  }
};

function winowClose() {
  if (document.getElementsByClassName('pl-current')[0]) db().run(`UPDATE status set dataId='${parseInt(document.getElementsByClassName('pl-current')[0].getAttribute('data-track'), 10)}', realid='${parseInt(document.getElementsByClassName('pl-current')[0].getAttribute('real-id'), 10)}', volume='${musicStatus.volume ? musicStatus.volume : 0.1}', loved='${isLoved ? "true" : "false"}'`);
  window.close();
}

function maxsize() {
  if (fullscreen == 0) {
    remote.getCurrentWindow().maximize();
    fullscreen++;
    document.getElementsByClassName("maximize")[0].innerHTML = `<i style="color: var(--text);" class="fas fa-square"></i>`;
  } else {
    remote.getCurrentWindow().unmaximize();
    fullscreen = 0;
    document.getElementsByClassName("maximize")[0].innerHTML = `<i style="color: var(--text);" class="far fa-square"></i>`;
  }
}

function searchbtn() {
  app.search();
  document.getElementById(`youtube`).style.display = "block";
}

async function addMusicFolder() {
  let dir = await remote.dialog.showOpenDialog({ title: 'Select Music Folder', properties: ['openDirectory'] });
  if (!dir.filePaths[0]) return;
  fs.readdir(dir.filePaths[0], function (err, items) {
    loadMusic();
    items.forEach((i, ind) => {
      setTimeout(() => {
        if (ind + 1 == items.length) loadMusic();
        if (i.toLocaleLowerCase().indexOf(".mp3") > -1) {
          if (db().query(`SELECT * from music where file='${dir.filePaths[0]}/${i}'`).length == 0) {
            let metadata = NodeID3.read(`${dir.filePaths[0]}/${i}`);
            let obj = {
              title: i.toLocaleLowerCase().split(".mp3"),
              file: `${dir.filePaths[0]}/${i}`.split("\\").join("/"),
              loved: "false"
            };
            if (metadata.title != undefined && metadata.artist != undefined) obj.title = `${metadata.artist} - ${metadata.title}`;
            if (metadata.image != undefined && metadata.image.imageBuffer != undefined) {
              fs.writeFileSync(`${root}/images/${obj.title}.jpg`, metadata.image.imageBuffer, 'binary');
              obj.icon = encodeURI(`${root}/images/${obj.title}.jpg`);
            }
            if (Array.isArray(obj.title)) obj.title = obj.title[0];
            obj.title = obj.title.replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, "");
            db().insert('music', obj);
            document.getElementById("load-progress").innerHTML = `<div class="textload">${obj.title}</div> <span> ${ind + 1}/${items.length}</span>`;
          }
        }
      }, 500 * ind)
    })
  });
}

async function addosu() {
  let dir = await remote.dialog.showOpenDialog({ title: 'Select osu!/songs Folder', properties: ['openDirectory'] });
  if (!dir.filePaths[0]) return;
  fs.readdir(dir.filePaths[0], function (err, items) {
    checkDir(0, items, dir.filePaths[0]);
    notify("Success", "Start importing osu! songs, plz wait :)")
  });
}

function checkDir(ind, mas, dir) {
  if (ind + 1 == mas.length) {
    refresh();
    app.osuimport = `Import osu! songs`;
    notify("Success", "Importing osu! songs completed :3")
  } else {
    let i = mas[ind].split("~").join("").split("'").join("").split("^").join("");
    let songFolder = i;
    if (i.indexOf(".") == -1) {
      fs.readdir(`${dir}/${i}`, function (err, files) {
        if (files) {
          if (files.toString().indexOf(".osu") == -1) return checkDir(ind + 1, mas, dir);
          let already = false;
          files.forEach(f => {
            if (f.indexOf(".osu") > -1) {
              if (!already) {
                already = true;
                app.osuimport = `Importing ${ind + 1}/${mas.length}`;
                parseOsu(ind, mas, dir, songFolder, f, i, files);
              }
            }
          })
        } else { checkDir(ind + 1, mas, dir); }
      })
    } else { checkDir(ind + 1, mas, dir); }
  }
}

function parseOsu(ind, mas, dir, songFolder, f, i, files) {
  let info = fs.readFileSync(`${dir}\\${songFolder}\\${f}`).toString(),
    title = f.split(".osu").join(""),
    bmid = songFolder.split(" ")[0],
    full = "";
  if (info.indexOf("Artist:") > -1 && info.indexOf("Title:") > -1) title = `${info.split(`Artist:`)[1].split("\n")[0]} - ${info.split(`Title:`)[1].split("\n")[0]}`.replace(/(\r\n|\n|\r)/gm, "");
  if (info.indexOf("BeatmapSetID") > -1) bmid = info.split(`BeatmapSetID:`)[1].split("\n")[0];
  files.forEach(img => { if (img.indexOf(".jpg") > -1 || img.indexOf(".png") > -1) { full = img; } });
  if (info.indexOf("AudioFilename: ") > -1) {
    let obj = { bmid: bmid, title: title.replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, ""), icon: `${root}/images/${bmid}.jpg`.split("\\").join("/").replace(/(\r\n|\n|\r)/gm, ""), file: `${dir}/${songFolder}/${info.split(`AudioFilename: `)[1].split("\n")[0]}`.split("\\").join("/").replace(/(\r\n|\n|\r)/gm, ""), dir: `${dir}/${i}`.split("\\").join("/").replace(/(\r\n|\n|\r)/gm, ""), full: `${dir}/${songFolder}/${full}`.split("\\").join("/").replace(/(\r\n|\n|\r)/gm, ""), loved: "false" };
    saveOsu(obj, mas, dir, bmid, ind, i);
  } else { checkDir(ind + 1, mas, dir); }
}

function saveOsu(obj, mas, dir, bmid, ind) {
  if (db().query(`SELECT * from music where dir='${obj.dir}'`).length == 0) {
    axios.get(`https://assets.ppy.sh/beatmaps/${bmid}/covers/card.jpg`, { responseType: 'arraybuffer' }).then(response => {
      fs.writeFileSync(`${root}/images/${bmid}.jpg`.split("\\").join("/").replace(/(\r\n|\n|\r)/gm, ""), Buffer.from(response.data, 'base64'));
      if (ind < 50) {
        app.playlist.push(obj);
        refresh();
      }
      if ((ind / 50).toString().indexOf(".") == -1) {
        app.playlist = db().query("SELECT * from music");
        refresh();
      }
      db().insert('music', obj);
      checkDir(ind + 1, mas, dir);
    }).catch(er => { checkDir(ind + 1, mas, dir); })
  } else { checkDir(ind + 1, mas, dir); }
}

async function exportLoved() {
  let dir = await remote.dialog.showOpenDialog({ title: 'Select osu!/songs Folder', properties: ['openDirectory'] });
  let exportLoved = [];
  db().query("SELECT * from music").forEach(m => { if (m.loved == 1) exportLoved.push(m); });
  if (dir.filePaths[0]) {
    setsToggle();
    loadMusic();
    exportProces(0, exportLoved, dir);
  }
}

async function exportAll() {
  let dir = await remote.dialog.showOpenDialog({ title: 'Select osu!/songs Folder', properties: ['openDirectory'] });
  if (dir.filePaths[0]) {
    setsToggle();
    loadMusic();
    exportProces(0, db().query("SELECT * from music"), dir);
  }
}

function exportProces(id, mas, dir) {
  if (id == mas.length) return loadMusic();
  let e = mas[id];
  document.getElementById("load-progress").innerHTML = `<div class="textload">${e.title}</div> <span> ${id + 1}/${mas.length}</span>`;
  fs.copyFile(e.file, `${dir.filePaths[0]}/${e.title}.mp3`, (err) => {
    if (err) throw err;
    if (e.full) {
      let metadata = {
        title: e.title.split(" - ")[1],
        artist: e.title.split(" - ")[0],
        APIC: e.full
      }
      NodeID3.update(metadata, `${dir.filePaths[0]}/${e.title}.mp3`, function (err, buffer) { exportProces(id + 1, mas, dir); })
    } else { exportProces(id + 1, mas, dir); }
  });
}

function offKey(el) { document.getElementById(el.getAttribute('dlya')).value = ""; }

for (let i = 0; i < document.getElementsByClassName('input-keys').length; i++) {
  document.getElementsByClassName('input-keys')[i].onkeyup = function (evt) {
    document.getElementsByClassName('check-key-input')[i].checked = false;
    if (evt.keyCode == 16) return;
    if (evt.key == "ArrowUp") {
      document.getElementsByClassName('input-keys')[i].value = "ctrl+Up";
    } else if (evt.key == "ArrowDown") {
      document.getElementsByClassName('input-keys')[i].value = "ctrl+Down";
    } else if (evt.key == "ArrowLeft") {
      document.getElementsByClassName('input-keys')[i].value = "ctrl+Left";
    } else if (evt.key == "ArrowRight") {
      document.getElementsByClassName('input-keys')[i].value = "ctrl+Right";
    } else if (evt.keyCode == 32) {
      document.getElementsByClassName('input-keys')[i].value = "ctrl+Space";
    } else {
      document.getElementsByClassName('input-keys')[i].value = "ctrl+" + evt.key;
    }
  }
}

function start() {
  var AudioPlayer = (function () {
    var player = document.getElementById('ap'),
      playBtn, prevBtn, nextBtn, plBtn, repeatBtn, volumeBtn, progressBar, preloadBar, curTime, durTime, trackTitle, audio, index = 0,
      playList, volumeBar, volumeLength, repeating = false, random = false, seeking = false, rightClick = false, apActive = false,
      pl = document.querySelector("#pl"), settings = { volume: db().query("SELECT * from status")[0].volume ? db().query("SELECT * from status")[0].volume : 0.1, autoPlay: false, notification: true, playList: [] };

    function init(options) {
      for (let i = 0; i < document.querySelectorAll(".music-el").length; i++) {
        if (document.querySelectorAll(".music-el")[i]) document.querySelectorAll(".music-el")[i].classList.remove('pl-current');
      }
      settings = extend(settings, options);
      playList = settings.playList;
      renderPL();
      youtubeRadio = false;
      if (!('classList' in document.documentElement)) return false;
      if (apActive || player === null) return;
      playBtn = player.querySelector('.ap-toggle-btn');
      prevBtn = player.querySelector('.ap-prev-btn');
      nextBtn = player.querySelector('.ap-next-btn');
      repeatBtn = player.querySelector('.ap-repeat-btn');
      volumeBtn = player.querySelector('.ap-volume-btn');
      plBtn = document.querySelector('.ap-playlist-btn');
      curTime = player.querySelector('.ap-time--current');
      durTime = player.querySelector('.ap-time--duration');
      trackTitle = player.querySelector('.ap-title');
      progressBar = player.querySelector('.ap-bar');
      preloadBar = player.querySelector('.ap-preload-bar');
      volumeBar = player.querySelector('.ap-volume-bar');
      playBtn.addEventListener('click', playToggle, false);
      volumeBtn.addEventListener('click', volumeToggle, false);
      repeatBtn.addEventListener('click', repeatToggle, false);
      document.querySelector(".randomToggle").addEventListener('click', randomToggle, false);
      progressBar.parentNode.parentNode.addEventListener('mousedown', handlerBar, false);
      progressBar.parentNode.parentNode.addEventListener('mousemove', seek, false);
      document.documentElement.addEventListener('mouseup', seekingFalse, false);
      volumeBar.parentNode.parentNode.addEventListener('mousedown', handlerVol, false);
      volumeBar.parentNode.parentNode.addEventListener('mousemove', setVolume);
      document.documentElement.addEventListener('mouseup', seekingFalse, false);
      prevBtn.addEventListener('click', prev, false);
      nextBtn.addEventListener('click', next, false);
      audio = new Audio();
      audio.volume = settings.volume;
      if (isEmptyList()) {
        empty();
        return;
      } else {
        apActive = true;
        audio.src = playList[index].file;
        audio.preload = 'auto';
        volumeBar.style.height = audio.volume * 100 + '%';
        volumeLength = volumeBar.css('height');
        audio.addEventListener('error', error, false);
        audio.addEventListener('timeupdate', update, false);
        audio.addEventListener('ended', doEnd, false);
      }
    }

    function renderPL() {
      var html = [];
      playList.reverse().forEach(function (item, i) {
        item.fav = `<i onclick="love(${item.id}, this);" class="fas fa-heart owo"></i>`;
        if (item.loved == true) item.fav = `<i onclick="love(${item.id}, this);" class="fas fa-heart owo fav"></i>`;
        item.type = '<svg fill="#fff" height="20" viewBox="0 0 24 24" width="20" xmlns="http://www.w3.org/2000/svg">' + '<path d="M0 0h24v24H0z" fill="none"/>' + '<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>' + '</svg>';
        if (item.file.indexOf("osu") > -1) item.type = `<img class="pl-img" src="assets/icons/osu.svg">`;
        if (item.videoId != undefined) item.type = `<i class="fab fa-youtube"></i>`;
        if (i < 80) {
          item.hide = true;
          html.push(item);
        } else {
          item.hide = false;
          html.push(item);
        }
      });
      app.playlist = html;
      setTimeout(() => {
        for (let i = 0; i < document.querySelectorAll('.music-el').length; i++) {
          document.querySelector("#pl").addEventListener('click', listHandler, false);
          let need = document.querySelectorAll(".pl-title")[i].innerHTML;
          if (need == app.status.title) {
            document.querySelectorAll(".music-el")[i].classList.add('pl-current');
            AP.setIndex(i);
          }
        }
        if (first && db().query("SELECT * from status")[0].dataId != 0 && db().query("SELECT * from status")[0].realId != 0) {
          first = false;
          index = parseInt(document.querySelector(`.music-el[real-id='${db().query("SELECT * from status")[0].realId}']`).getAttribute("data-track"));
          audio.src = playList[index].file;
          audio.preload = 'auto';
          app.status.title = playList[index].title;
        }
      }, 500)
    }

    document.getElementsByClassName("container")[0].onscroll = function () {
      if (isLoaded == true) return;
      if (loaded == 0) loaded = 80;
      var isElViu = isElementInView($(`li[data-track="${loaded - 5}"]`), false);

      if (isElViu) {
        isLoaded = true;
        for (let i = loaded; i < loaded + 50; i++) {
          if (app.playlist[i].hide == false) app.playlist[i].hide = true;
        }
        for (let i = 0; i < document.querySelectorAll('.music-el').length; i++) {
          document.querySelector("#pl").addEventListener('click', listHandler, false);
        }
        setTimeout(() => {
          isLoaded = false
        }, 500);
        loaded = loaded + 50;
      }
    };

    function listHandler(evt) {
      youtubeRadio = false;
      evt.preventDefault();
      let aw = evt.target.className;
      if (aw == 'pl-title') {
        let current = parseInt(evt.target.parentNode.getAttribute('data-track'), 10);
        index = current;
        parseInt(evt.target.parentNode.getAttribute('real-id'), 10);
        audio.readyState = 0;
        plActive();
        play();
      } else {
        let target = evt.target;
        if (target.className === 'fas fa-heart owo' || target.className === 'fas fa-heart owo fav' || target.className == 'right') return;
        while (target.className !== pl.className) {
          if (target.className === 'pl-remove' || target.className === 'pl-del' || target.className === 'right') {
            M.toast({ html: `<i style="margin-right: 10px;" class="fas fa-trash"></i> <span>${db().query("SELECT * from music WHERE id=" + parseInt(target.parentNode.getAttribute('real-id'), 10))[0].title}</span>` });
            db().run(`DELETE from music where id=${parseInt(target.parentNode.getAttribute('real-id'), 10)}`);
            if (!isLoved) { refresh(); } else { openloved(); };
            let isDel = parseInt(target.parentNode.getAttribute('data-track'), 10);
            if (!audio.paused) {
              if (isDel === index) {
                play();
              }
            } else {
              if (isEmptyList()) {
                empty();
              } else {
                audio.src = playList[index].file;
                document.title = trackTitle.innerHTML = playList[index].title;
                progressBar.style.width = 0;
              }
            }
            if (isDel < index) {
              index--;
            }
            return;
          }
          target = target.parentNode;
        }
      }
    }

    function plActive() {
      if (audio.paused) {
        if (document.querySelector(".pl-current")) document.querySelectorAll('.music-el')[index].classList.remove('pl-current');
        return;
      }
      for (var i = 0, len = document.querySelectorAll('.music-el').length; len > i; i++) {
        document.querySelectorAll('.music-el')[i].classList.remove('pl-current');
      }
      document.querySelectorAll('.music-el')[index].classList.add('pl-current');
    }

    function error() {
      !isEmptyList() && next();
    }

    function play() {
      index = (index > playList.length - 1) ? 0 : index;
      index;
      if (index < 0) index = playList.length - 1;
      if (isEmptyList()) {
        empty();
        return;
      }
      audio.src = playList[index].file;
      audio.preload = 'auto';
      document.title = app.status.title = playList[index].title;
      audio.play();
      playBtn.classList.add('playing');
      plActive();
    }

    function prev() {
      youtubeRadio = false;
      if (random) return randomTrack();
      index = index - 1;
      if (mini == true && ping > 1) {
        document.getElementById('hide-progres').style.width = `100%`;
        ping = 5;
      }
      notify(`Now playing`, app.playlist[index].title)
      play();
    }

    function next() {
      youtubeRadio = false;
      if (random) return randomTrack();
      index = index + 1;
      if (mini == true && ping > 1) {
        document.getElementById('hide-progres').style.width = `100%`;
        ping = 5;
      }
      notify(`Now playing`, app.playlist[index].title)
      play();
    }

    function randomTrack() {
      youtubeRadio = false;
      index = getRandomInt(0, db().query("SELECT * from music").length);
      if (mini == true && ping > 1) {
        document.getElementById('hide-progres').style.width = `100%`;
        ping = 5;
      }
      notify(`Now playing`, app.playlist[index].title)
      play();
    }

    function isEmptyList() {
      return playList.length === 0;
    }

    function empty() {
      audio.pause();
      audio.src = '';
      app.status.title = 'Playlist is empty';
      app.status.progress = ``;
      // pl.innerHTML = '<div class="pl-empty"><img src="https://image.flaticon.com/icons/svg/1679/1679882.svg" class="emss" /> PlayList is empty</div>';
    }


    function playToggle() {
      if (isEmptyList()) return;
      if (youtubeRadio) {
        radioPlayer.getPlayerState() === YT.PlayerState.PLAYING || radioPlayer.getPlayerState() === YT.PlayerState.BUFFERING ? radioPlayer.pauseVideo() : radioPlayer.playVideo();
        return;
      };
      if (audio.paused) {
        audio.play();
        playBtn.classList.add('playing');
      } else {
        audio.pause();
        playBtn.classList.remove('playing');
      }
      plActive();
    }

    function volumeToggle() {
      if (audio.muted) {
        if (parseInt(volumeLength, 10) === 0) {
          volumeBar.style.height = '100%';
          audio.volume = 1;
        } else { volumeBar.style.height = volumeLength; };
        audio.muted = false;
        this.classList.remove('muted');
      } else {
        audio.muted = true;
        volumeBar.style.height = 0;
        this.classList.add('muted');
      }
    }

    function repeatToggle() {
      var repeat = this.classList;
      if (repeat.contains('ap-active')) {
        repeating = false;
        repeat.remove('ap-active');
      } else {
        repeating = true;
        repeat.add('ap-active');
      }
    }

    function randomToggle() {
      var randomel = document.querySelector(".randomToggle").classList;
      if (randomel.contains('ap-active')) {
        random = false;
        document.querySelector(".randomToggle").classList.remove('ap-active');
      } else {
        random = true;
        document.querySelector(".randomToggle").classList.add('ap-active');
      }
    }

    function update() {
      if (audio.readyState === 0) return;
      var barlength = Math.round(audio.currentTime * (100 / audio.duration));
      progressBar.style.width = barlength + '%';
      var curMins = Math.floor(audio.currentTime / 60),
        curSecs = Math.floor(audio.currentTime - curMins * 60),
        mins = Math.floor(audio.duration / 60),
        secs = Math.floor(audio.duration - mins * 60);
      (curSecs < 10) && (curSecs = '0' + curSecs);
      (secs < 10) && (secs = '0' + secs);
      app.status.progress = `${curMins}:${curSecs}/${mins}:${secs}`;
      var buffered = audio.buffered;
      if (buffered.length) {
        var loaded = Math.round(100 * buffered.end(0) / audio.duration);
        preloadBar.style.width = loaded + '%';
      }
      musicStatus.progress = barlength;
      musicStatus.curTime = `${curMins}:${curSecs}`;
      musicStatus.durTime = `${mins}:${secs}`;
    }

    function doEnd() {
      if (random) return randomTrack();
      if (index == playList.length - 1) {
        if (!repeating) {
          audio.pause();
          plActive();
          playBtn.classList.remove('playing');
          return;
        } else {
          index = 0;
          play();
        }
      } else {
        if (!repeating) index = (index === playList.length - 1) ? 0 : index + 1;
        let title = document.getElementsByClassName('pl-title')[index].innerHTML;
        notify(`Now playing`, title)
        play();
      }
    }

    function moveBar(evt, el, dir) {
      var value;
      if (dir === 'horizontal') {
        value = Math.round((evt.clientX - el.offset().left) * 100 / el.parentNode.offsetWidth);
        el.style.width = value + '%';
        return value;
      } else {
        var offset = el.offset().top + el.offsetHeight;
        value = Math.round((offset - evt.clientY));
        if (value > 100) value = 100;
        if (value < 0) value = 0;
        volumeBar.style.height = value + '%';
        return value;
      }
    }

    function volumeUp(value) {
      if (mini == true) {
        miniPlayer();
        document.getElementsByClassName('ap-volume')[0].style.height = "120px";
        document.getElementsByClassName('ap-volume')[0].style.visibility = "visible";
        document.getElementsByClassName('ap-volume-container')[0].style.background = 'var(--block)';
      } else {
        document.getElementsByClassName('ap-volume')[0].style.height = "120px";
        document.getElementsByClassName('ap-volume')[0].style.visibility = "visible";
        document.getElementsByClassName('ap-volume-container')[0].style.background = 'var(--block)';
        setTimeout(() => {
          if (document.getElementsByClassName('ap-volume')[0].style.height == "120px") {
            document.getElementsByClassName('ap-volume')[0].style.height = null;
            document.getElementsByClassName('ap-volume')[0].style.visibility = null;
            document.getElementsByClassName('ap-volume-container')[0].style.background = null;
          }
        }, 3000)
      }
      value = audio.volume * 100 + 2;
      if (value > 100) value = 100;
      if (value < 0) value = 0;
      volumeBar.style.height = value + '%';
      audio.volume = Number(value / 100);
    }

    function volumeDown(value) {
      if (mini == true) {
        miniPlayer();
        document.getElementsByClassName('ap-volume')[0].style.height = "120px";
        document.getElementsByClassName('ap-volume')[0].style.visibility = "visible";
        document.getElementsByClassName('ap-volume-container')[0].style.background = 'var(--block)';
      } else {
        document.getElementsByClassName('ap-volume')[0].style.height = "120px";
        document.getElementsByClassName('ap-volume')[0].style.visibility = "visible";
        document.getElementsByClassName('ap-volume-container')[0].style.background = 'var(--block)';
        setTimeout(() => {
          if (document.getElementsByClassName('ap-volume')[0].style.height == "120px") {
            document.getElementsByClassName('ap-volume')[0].style.height = null;
            document.getElementsByClassName('ap-volume')[0].style.visibility = null;
            document.getElementsByClassName('ap-volume-container')[0].style.background = null;
          }
        }, 3000)
      }
      value = audio.volume * 100 - 2;
      if (value > 100) value = 100;
      if (value < 0) value = 0;
      volumeBar.style.height = value + '%';
      audio.volume = Number(value / 100);
    }

    function handlerBar(evt) {
      rightClick = (evt.which === 3) ? true : false;
      seeking = true;
      seek(evt);
    }

    function handlerVol(evt) {
      rightClick = (evt.which === 3) ? true : false;
      seeking = true;
      setVolume(evt);
    }

    function seek(evt) {
      if (seeking && rightClick === false && audio.readyState !== 0) {
        var value = moveBar(evt, progressBar, 'horizontal');
        audio.currentTime = audio.duration * (value / 100);
      }
    }

    function seekingFalse() {
      seeking = false;
    }

    function setIndex(value) {
      index = value;
    }

    function setVolume(evt) {
      volumeLength = volumeBar.css('height');
      if (seeking && rightClick === false) {
        musicStatus.volume = moveBar(evt, volumeBar.parentNode, 'vertical') / 100;
        var value = moveBar(evt, volumeBar.parentNode, 'vertical') / 100;
        if (value <= 0) {
          audio.volume = 0;
          volumeBtn.classList.add('muted');
        } else {
          if (audio.muted) audio.muted = false;
          audio.volume = value;
          volumeBtn.classList.remove('muted');
        }
      }
    }

    function radio(id) {
      if (!id) {
        $(".menu-left").removeClass('act-menu');
        $(".shadow").hide();
        document.querySelector(".radio-choise").classList.toggle("active");
        return;
      } 
      id = id.split(`v=`)[1];
      document.querySelector(".radio-choise").classList.toggle("active");
      if (!audio.paused) {
        audio.pause();
        playBtn.classList.remove('playing');
      }
      plActive();
      axios.get(`https://www.googleapis.com/youtube/v3/videos?part=snippet&&id=${id}&key=AIzaSyBBFxx0yqaUfX8V17A4M8UcAiOx-eKXYcs`)
        .then(res => {
          app.status.title = res.data.items[0].snippet.title;
          app.status.progress = `<i class="fas red fa-broadcast-tower"></i>`;
        })
      youtubeRadio = true;
      document.querySelector(".ap--play").style.display = "none";
      document.querySelector(".ap--pause").style.display = "none";
      document.querySelector(".ap-progress-container").style.display = "none";
      if (!document.getElementById("youtube-player")) {
        var e = document.getElementById("youtube-audio"),
          t = document.createElement("img");
        t.setAttribute("id", "youtube-icon"), t.style.cssText = "cursor:pointer;cursor:hand", e.appendChild(t);
        var a = document.createElement("div");
        a.setAttribute("id", "youtube-player"), e.appendChild(a);
        var o = function (e) {
          var a = e ? "IDzX9gL.png" : "quyUPXN.png";
          t.setAttribute("src", "https://i.imgur.com/" + a)
        };
        e.onclick = function () {
          radioPlayer.getPlayerState() === YT.PlayerState.PLAYING || radioPlayer.getPlayerState() === YT.PlayerState.BUFFERING ? (radioPlayer.pauseVideo(), o(!1)) : (radioPlayer.playVideo(), o(!0))
        };
        radioPlayer = new YT.Player("youtube-player", {
          height: "0",
          width: "0",
          videoId: id,
          playerVars: {
            autoplay: 1,
            loop: 1
          },
          events: {
            onReady: function (ee) {
              setInterval(() => {
                if (!youtubeRadio && e.style.display != "none") {
                  e.style.display = "none";
                  app.status.progress = "";
                  document.querySelector(".ap--play").style.display = null;
                  document.querySelector(".ap--pause").style.display = null;
                  document.querySelector(".ap-progress-container").style.display = null;
                  radioPlayer.pauseVideo();
                }
                radioPlayer.setVolume(parseFloat(audio.volume) * 100);
              }, 100)
              radioPlayer.setPlaybackQuality("small"), o(radioPlayer.getPlayerState() !== YT.PlayerState.CUED)
            },
            onStateChange: function (e) {
              e.data === YT.PlayerState.ENDED && o(!1)
            }
          }
        })
      } else {
        document.getElementById("youtube-audio").style.display = null;
        radioPlayer.loadVideoById(id);
        radioPlayer.playVideo();
      }
    }

    function destroy() {
      if (!apActive) return;
      playBtn.removeEventListener('click', playToggle, false);
      volumeBtn.removeEventListener('click', volumeToggle, false);
      repeatBtn.removeEventListener('click', repeatToggle, false);
      progressBar.parentNode.parentNode.removeEventListener('mousedown', handlerBar, false);
      progressBar.parentNode.parentNode.removeEventListener('mousemove', seek, false);
      document.documentElement.removeEventListener('mouseup', seekingFalse, false);
      volumeBar.parentNode.parentNode.removeEventListener('mousedown', handlerVol, false);
      volumeBar.parentNode.parentNode.removeEventListener('mousemove', setVolume);
      document.documentElement.removeEventListener('mouseup', seekingFalse, false);
      prevBtn.removeEventListener('click', prev, false);
      nextBtn.removeEventListener('click', next, false);
      audio.removeEventListener('error', error, false);
      audio.removeEventListener('timeupdate', update, false);
      audio.removeEventListener('ended', doEnd, false);
      player.parentNode.removeChild(player);
      pl.removeEventListener('click', listHandler, false);
      pl.parentNode.removeChild(pl);
      audio.pause();
      apActive = false;
    }

    function extend(defaults, options) {
      for (var name in options) {
        if (defaults.hasOwnProperty(name)) {
          defaults[name] = options[name];
        }
      }
      return defaults;
    }

    function create(el, attr) {
      var element = document.createElement(el);
      if (attr) {
        for (var name in attr) {
          if (element[name] !== undefined) {
            element[name] = attr[name];
          }
        }
      }
      return element;
    }
    Element.prototype.offset = function () {
      var el = this.getBoundingClientRect(),
        scrollLeft = window.pageXOffset || document.documentElement.scrollLeft,
        scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      return {
        top: el.top + scrollTop,
        left: el.left + scrollLeft
      };
    };
    Element.prototype.css = function (attr) {
      if (typeof attr === 'string') {
        return getComputedStyle(this, '')[attr];
      } else if (typeof attr === 'object') {
        for (var name in attr) {
          if (this.style[name] !== undefined) {
            this.style[name] = attr[name];
          }
        }
      }
    };

    return { radio: radio, setIndex: setIndex, listHandler: listHandler, init: init, destroy: destroy, playToggle: playToggle, next: next, prev: prev, random: randomTrack, plActive: plActive, mute: volumeToggle, volumeUp: volumeUp, volumeDown: volumeDown };
  })();

  window.AP = AudioPlayer;
}

function refresh() {
  AP.init({
    playList: db().query("SELECT * from music")
  });

  if (document.querySelector('#youtube').style.display != "none") {
    document.querySelector('#youtube').style.display = "none";
    document.querySelector('#pl').classList.remove("hide");
  }
  loaded = 0;
  isLoved = false;

  if (document.getElementsByClassName("pl-container")[1] != undefined) {
    document.getElementsByClassName("pl-container")[1].parentNode.removeChild(document.getElementsByClassName("pl-container")[1]);
  }
}

function youtube(vid, title, icon) {
  if (db().query(`SELECT * from music where videoId='${vid}'`).length > 0) return notify('Error', 'Song already in playlist :3');
  $.get("https://images" + ~~(Math.random() * 33) + "-focus-opensocial.googleusercontent.com/gadgets/proxy?container=none&url=https%3A%2F%2Fwww.youtube.com%2Fget_video_info%3Fvideo_id%3D" + vid, function (data) {
    if (data.indexOf("errorcode=150") > -1) return notify('Error', 'Copyright');
    var data = parse_str(data),
      streams = (data.url_encoded_fmt_stream_map + ',' + data.adaptive_fmts).split(',');
    if (data.url_encoded_fmt_stream_map == "") return notify('Error', 'Copyright or NOT FOUND');
    $.each(streams, function (n, s) {
      let stream = parse_str(s),
        itag = stream.itag * 1,
        quality = false;
      switch (itag) {
        case 139: quality = "48kbps"; break;
        case 140: quality = "128kbps"; break;
        case 141: quality = "256kbps"; break;
      }
      if (quality) {
        notify('YouTube', `${title} added to download queue`, false);
        let obj = { title: title, icon: icon, file: `${root}/youtube/${title}.mp3`, videoId: vid, loved: "false" };
        remote.require("electron-download-manager").download({
          url: stream.url
        }, function (error, info) {
          ytQuery = ytQuery.filter(y => y.videoId != obj.videoId);
          if (ytQuery.length > 0) { document.getElementById("yt").innerHTML = `YouTube <i onclick="clearYT()" class="fas fa-download"></i> ${ytQuery.length}`; } else { document.getElementById("yt").innerHTML = `YouTube`; };
          if (error) {
            notify('Error', 'Copyright or NOT FOUND');
            return;
          }
          axios.get(obj.icon, { responseType: 'arraybuffer' }).then(response => {
            fs.writeFileSync(`${root}/images/${obj.videoId}.jpg`.split("\\").join("/"), Buffer.from(response.data, 'base64'));
            fs.rename(info.filePath, `${root}/youtube/${obj.videoId}.mp3`, function (err) {
              if (err) throw err;
              db().insert('music', {
                title: obj.title.replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, ""),
                icon: `${root}/images/${obj.videoId}.jpg`.split("\\").join("/"),
                file: `${root}/youtube/${obj.videoId}.mp3`,
                videoId: obj.videoId,
                loved: "false"
              });
              notify("YouTube", `Download ${obj.title} complete :3`, true);
            });
          }).catch(er => { })
        });
        ytQuery.push(obj);
        document.getElementById("yt").innerHTML = `YouTube <i onclick="clearYT()" class="fas fa-download"></i> ${ytQuery.length}`;
      }
    });
  })
}

function clearYT() {
  document.getElementById("yt").innerHTML = `YouTube`;
  ytQuery = [];
}

function parse_str(str) {
  return str.split('&').reduce(function (params, param) {
    var paramSplit = param.split('=').map(function (value) {
      return decodeURIComponent(value.replace('+', ' '));
    });
    params[paramSplit[0]] = paramSplit[1];
    return params;
  }, {});
}

function lovethis() {
  love(parseInt(document.getElementsByClassName('pl-current')[0].getAttribute('real-id'), 10), document.getElementsByClassName('owo')[document.getElementsByClassName('pl-current')[0].getAttribute('data-track')]);
}

function getRandomInt(min, max) { return Math.round(Math.random() * (max - min)) + min; };

function shuffle(arr) {
  var j, temp;
  for (var i = arr.length - 1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1));
    temp = arr[j];
    arr[j] = arr[i];
    arr[i] = temp;
  }
  return arr;
}

function miniPlayer() {
  if (document.getElementById('ap').style.transform == "translateY(180px)") {
    document.getElementById('hide-progres').style.display = "none";
    document.getElementById('ap').style.transform = "translateY(0px)";
    document.getElementById('hide-progres').style.width = `100%`;
    document.getElementById('hide-progres').style.display = "block";
  } else {
    document.getElementById('hide-progres').style.display = "block";
  }
  document.getElementById('pl').style.display = "none";
  document.getElementsByClassName('center')[0].style.display = "none";
  document.getElementsByClassName('top')[0].style.display = "none";
  document.getElementsByClassName('main')[0].style.background = "transparent";
  document.getElementsByClassName('bottom')[0].style.position = "absolute";
  document.getElementsByClassName('bottom')[0].style.bottom = "0";
  remote.getCurrentWindow().setSize(screen.availWidth, 55);
  remote.getCurrentWindow().setPosition(0, screen.availHeight - 55);
  remote.getCurrentWindow().setSkipTaskbar(true);
  remote.getCurrentWindow().focus();
  mini = true;
  ping = 5;
}

setInterval(() => {
  if (ping != false) {
    if (!$('#ap').is(':hover') && document.getElementById('ap').style.transform != "translateY(180px)") {
      if (ping == 1 && mini == true) {
        document.getElementsByClassName('ap-volume')[0].style.height = null;
        document.getElementsByClassName('ap-volume')[0].style.visibility = null;
        document.getElementsByClassName('ap-volume-container')[0].style.background = null;
        document.getElementById('ap').style.transform = `translateY(180px)`;
        remote.getCurrentWindow().hide();
        ping = false;
      } else {
        if (mini == true) {
          ping--;
          document.getElementById('hide-progres').style.width = `${((ping - 1) * 2) * 10}%`;
        }
      }
    }
  };
}, 1000)

function miniPlayerOff() {
  if (document.getElementById('ap').style.transform == "translateY(180px)") document.getElementById('ap').style.transform = `translateY(0px)`;
  remote.getCurrentWindow().focus();
  document.getElementById('pl').style.display = "block";
  document.getElementById('hide-progres').style.display = "none";
  document.getElementsByClassName('center')[0].style.display = null;
  document.getElementsByClassName('top')[0].style.display = "flex";
  document.getElementsByClassName('main')[0].style.background = "var(--bg)";
  document.getElementsByClassName('bottom')[0].style.position = null;
  document.getElementsByClassName('bottom')[0].style.bottom = null;
  remote.getCurrentWindow().setSize(1000, 700);
  remote.getCurrentWindow().center();
  remote.getCurrentWindow().setSkipTaskbar(false);
  mini = false;
}

function love(id, el) {
  let track = db().query(`SELECT * from music where id=${id}`)[0];
  if (track.loved == true) {
    db().run(`UPDATE music SET loved=false WHERE id=${id};`);
    el.classList.remove("fav");
    notify('Removed from loved :c', `${track.title}`);
    if (isLoved == true) openloved();
  } else {
    notify('Added to loved :3', `${track.title}`);
    el.classList.add("fav");
    db().run(`UPDATE music SET loved=true WHERE id=${id};`);
  }
}

function isElementInView(element, fullyInView) {
  var pageTop = $(window).scrollTop();
  var pageBottom = pageTop + $(window).height();
  var elementTop = $(element).offset().top;
  var elementBottom = elementTop + $(element).height();

  if (fullyInView === true) {
    return ((pageTop < elementTop) && (pageBottom > elementBottom));
  } else {
    return ((elementTop <= pageBottom) && (elementBottom >= pageTop));
  }
}

function loadMusic() {
  if (document.getElementById('load-music').style.display == "" || document.getElementById('load-music').style.display == "none") {
    document.getElementsByClassName('menu-left')[0].classList.remove('act-menu');
    document.getElementsByClassName('shadow')[0].style.display = "none";
    document.getElementById('pl').style.display = "none";
    document.getElementById('youtube').style.display = "none";
    document.getElementById('ap').style.display = "none";
    document.getElementById("settings").classList.remove("openSettings");
    document.getElementById('load-music').style.display = "block";
    document.getElementById('yomp').style.background = "var(--bg)";
    document.getElementsByClassName('main')[0].style.height = "35px";
    document.getElementsByClassName('maximize')[0].style.opacity = "0";
    document.getElementsByClassName('minimize')[0].style.opacity = "0";
    remote.getCurrentWindow().setSize(500, 91);
    remote.getCurrentWindow().center();
  } else {
    refresh();
    remote.getCurrentWindow().focus();
    document.getElementById('pl').style.display = null;
    document.getElementById('youtube').style.display = null;
    document.getElementById('ap').style.display = null;
    document.getElementById('load-music').style.display = null;
    document.getElementById('yomp').style.background = null;
    document.getElementsByClassName('main')[0].style.height = null;
    document.getElementsByClassName('maximize')[0].style.opacity = null;
    document.getElementsByClassName('minimize')[0].style.opacity = null;
    remote.getCurrentWindow().setSize(1000, 700);
    remote.getCurrentWindow().center();
  }
}

function openloved() {
  isLoved = true;
  let lovedMas = [];

  db().query("SELECT * from music").forEach(l => {
    if (l.loved == true) lovedMas.push(l);
  })

  AP.init({
    playList: lovedMas
  });

  loaded = 0;

  if (document.querySelector('#youtube').style.display != "none") {
    document.querySelector('#youtube').style.display = "none";
    document.querySelector('#pl').classList.remove("hide");
  }

  if (document.getElementsByClassName("pl-container")[1] != undefined) {
    document.getElementsByClassName("pl-container")[1].parentNode.removeChild(document.getElementsByClassName("pl-container")[1]);
  }
}

function discordUpdate() {
  let progress = "";
  for (let i = 0; i < 10; i++) {
    if (parseInt(musicStatus.progress / 10).toFixed(0) > i) {
      progress += "-";
    } else if (parseInt(musicStatus.progress / 10).toFixed(0) == i) {
      progress += "●";
    } else {
      progress += "-"
    }
  }
  if (document.getElementsByClassName('pl-current')[0]) {
    ipc.send("rpc", {
      status: "playing",
      title: document.querySelector('.ap-title').innerHTML,
      progress: `${musicStatus.curTime} [${progress}] ${musicStatus.durTime}`
    });
  } else {
    ipc.send("rpc", {
      status: "paused",
      title: document.querySelector('.ap-title').innerHTML,
      progress: `${musicStatus.curTime} [${progress}] ${musicStatus.durTime}`
    });
  }
  setTimeout(() => { discordUpdate() }, 1000);
}

function loadSettings() {
  if (db().query("select * from settings")[0].notiturn == "true") document.getElementById('noti-turn').checked = true;
  if (db().query("select * from settings")[0].notiloved == "true") document.getElementById('noti-loved').checked = true;
  if (db().query("select * from settings")[0].notiadd == "true") document.getElementById('noti-youtube').checked = true;
  if (db().query("select * from settings")[0].keyplay == "") document.getElementsByClassName('check-key-input')[0].checked = true;
  if (db().query("select * from settings")[0].keynext == "") document.getElementsByClassName('check-key-input')[1].checked = true;
  if (db().query("select * from settings")[0].keyprev == "") document.getElementsByClassName('check-key-input')[2].checked = true;
  if (db().query("select * from settings")[0].keyrandom == "") document.getElementsByClassName('check-key-input')[3].checked = true;
  if (db().query("select * from settings")[0].keyvolumeup == "") document.getElementsByClassName('check-key-input')[4].checked = true;
  if (db().query("select * from settings")[0].keyvolumedown == "") document.getElementsByClassName('check-key-input')[5].checked = true;
  if (db().query("select * from settings")[0].keymute == "") document.getElementsByClassName('check-key-input')[6].checked = true;
  if (db().query("select * from settings")[0].keylove == "") document.getElementsByClassName('check-key-input')[7].checked = true;
  if (db().query("select * from settings")[0].keymini == "") document.getElementsByClassName('check-key-input')[8].checked = true;
  if (db().query("select * from settings")[0].keyfocus == "") document.getElementsByClassName('check-key-input')[9].checked = true;
  document.getElementById('key-toggle').value = db().query("select * from settings")[0].keyplay;
  document.getElementById('key-next').value = db().query("select * from settings")[0].keynext;
  document.getElementById('key-prev').value = db().query("select * from settings")[0].keyprev;
  document.getElementById('key-random').value = db().query("select * from settings")[0].keyrandom;
  document.getElementById('key-volup').value = db().query("select * from settings")[0].keyvolumeup;
  document.getElementById('key-voldown').value = db().query("select * from settings")[0].keyvolumedown;
  document.getElementById('key-mute').value = db().query("select * from settings")[0].keymute;
  document.getElementById('key-love').value = db().query("select * from settings")[0].keylove;
  document.getElementById('key-mini').value = db().query("select * from settings")[0].keymini;
  document.getElementById('key-minioff').value = db().query("select * from settings")[0].keyfocus;
}

$(document).on('click', 'a[href^="http"]', function (event) {
  event.preventDefault();
  shell.openExternal(this.href);
});
