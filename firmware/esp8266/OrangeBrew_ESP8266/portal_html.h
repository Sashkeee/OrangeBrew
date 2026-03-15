#pragma once
#include <pgmspace.h>

// HTML captive-portal страницы настройки.
// Вынесен в отдельный .h файл, чтобы обойти баг препроцессора Arduino IDE
// с raw string literals (R"...") в .ino файлах.

static const char PORTAL_HTML[] PROGMEM = R"rawhtml(
<!DOCTYPE html><html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OrangeBrew Setup</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,sans-serif;background:#111;color:#fff;min-height:100vh;
     display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#1e1e1e;border:1px solid #2e2e2e;border-radius:16px;
      padding:28px;width:100%;max-width:440px}
.header{display:flex;align-items:center;gap:12px;margin-bottom:24px}
.logo{font-size:2rem}
h1{font-size:1.25rem;color:#ffa000;line-height:1.2}
.sub{font-size:.82rem;color:#666;margin-top:2px}
.block{margin-bottom:20px}
.block-title{font-size:.7rem;text-transform:uppercase;letter-spacing:1.5px;
             color:#ffa000;margin-bottom:10px}
label{display:block;font-size:.82rem;color:#999;margin-bottom:4px;margin-top:10px}
label:first-child{margin-top:0}
input{width:100%;padding:11px 14px;background:#111;border:1px solid #333;
      border-radius:8px;color:#fff;font-size:.95rem;transition:border .2s}
input:focus{outline:none;border-color:#ffa000}
.net-item{display:flex;align-items:center;gap:8px;padding:9px 12px;
          border-radius:8px;cursor:pointer;transition:background .15s;
          border:1px solid transparent;margin-bottom:4px}
.net-item:hover{background:#2a2a2a;border-color:#3a3a3a}
.net-item.active{background:#1e2a0e;border-color:#ffa000}
.net-ssid{flex:1;font-size:.9rem}
.net-rssi{font-size:.7rem;color:#888;font-family:monospace;white-space:nowrap}
.net-lock{font-size:.8rem;margin-left:2px}
.divider{display:flex;align-items:center;gap:8px;margin:12px 0;color:#444;font-size:.75rem}
.divider::before,.divider::after{content:"";flex:1;height:1px;background:#333}
.code-input{letter-spacing:6px;font-size:1.6rem;text-align:center;
            text-transform:uppercase;font-family:monospace}
.hint{font-size:.78rem;color:#555;margin-top:5px}
.hint a{color:#ffa000;text-decoration:none}
.btn{display:block;width:100%;background:#ffa000;color:#000;border:none;
     padding:14px;border-radius:8px;font-size:1rem;font-weight:700;
     cursor:pointer;margin-top:24px;transition:background .15s}
.btn:hover{background:#ffb300}
.btn:disabled{background:#555;color:#888;cursor:not-allowed}
.msg{padding:12px 14px;border-radius:8px;margin-top:16px;font-size:.88rem}
.msg-ok  {background:#0d2b0d;border:1px solid #2e7d32;color:#81c784}
.msg-err {background:#2b0d0d;border:1px solid #c62828;color:#ef9a9a}
.msg-info{background:#0d1a2b;border:1px solid #1565c0;color:#90caf9}
.footer{font-size:.7rem;color:#333;text-align:center;margin-top:20px;font-family:monospace}
.scanning{color:#888;font-size:.82rem;padding:8px 0}
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <span class="logo">&#x1F37A;</span>
    <div><h1>OrangeBrew Setup</h1><div class="sub">NodeMCU ESP8266 v2.2</div></div>
  </div>

  <form method="POST" action="/save" id="form">
    <div class="block">
      <div class="block-title">&#x1F4E1; Wi-Fi</div>
      <div id="net-list"><div class="scanning">&#x23F3; Загрузка списка сетей...</div></div>

      <div class="divider">или введите вручную</div>

      <label>Название сети (SSID)</label>
      <input type="text" name="ssid" id="ssid-input"
             placeholder="Введите SSID вручную" autocomplete="off">

      <label>Пароль</label>
      <input type="password" name="pass" id="pass-input"
             placeholder="Пароль (если есть)">
    </div>

    <div class="block">
      <div class="block-title">&#x1F517; Код сопряжения</div>
      <input class="code-input" type="text" name="code"
             placeholder="XXXXXX" maxlength="6" required
             oninput="this.value=this.value.toUpperCase()">
      <p class="hint">Получите код на
        <a href="https://%%HOST%%/devices/pair" target="_blank">%%HOST%%</a>
      </p>
    </div>

    <button class="btn" type="submit" id="submit-btn">&#x2713; Подключить</button>
  </form>

  %%STATUS%%
  <div class="footer">%%DEVICE_ID%%</div>
</div>

<script>
var selectedSsid='';
fetch('/scan').then(function(r){return r.json();}).then(function(nets){
  var el=document.getElementById('net-list');
  if(!nets||nets.length===0){el.innerHTML='<div class="scanning">Сети не найдены - введите вручную</div>';return;}
  var html='';
  nets.forEach(function(n){
    var lock=n.open?'':'&#x1F512;';
    html+='<div class="net-item" onclick="selectNet(this,\''+esc(n.ssid)+'\')">'+
          '<span class="net-ssid">'+esc(n.ssid)+'</span>'+
          '<span class="net-rssi">'+n.signal+'</span>'+
          '<span class="net-lock">'+lock+'</span></div>';
  });
  el.innerHTML=html;
}).catch(function(){
  document.getElementById('net-list').innerHTML='<div class="scanning">Список недоступен - введите вручную</div>';
});
function esc(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function selectNet(el,ssid){
  document.querySelectorAll('.net-item').forEach(function(x){x.classList.remove('active');});
  el.classList.add('active');
  selectedSsid=ssid;
  document.getElementById('ssid-input').value=ssid;
  document.getElementById('pass-input').focus();
}
document.getElementById('ssid-input').addEventListener('input',function(){
  if(this.value!==selectedSsid){
    document.querySelectorAll('.net-item').forEach(function(x){x.classList.remove('active');});
    selectedSsid='';
  }
});
document.getElementById('form').addEventListener('submit',function(e){
  var ssid=document.getElementById('ssid-input').value.trim();
  var code=document.querySelector('[name=code]').value.trim();
  if(!ssid){e.preventDefault();alert('Выберите или введите название Wi-Fi сети');return;}
  if(code.length!==6){e.preventDefault();alert('Код сопряжения - 6 символов');return;}
  document.getElementById('submit-btn').disabled=true;
  document.getElementById('submit-btn').textContent='Подключаюсь...';
});
</script>
</body></html>
)rawhtml";
