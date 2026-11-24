(async()=>{
  const api=window.easyTV;
  const [station,prefs,locale]=await Promise.all([api.currentRadio(),api.getPreferences(),api.getI18n()]);
  if(!station)return;
  const lang=prefs.language==='auto'?locale.systemLanguage:prefs.language;
  const t=key=>locale.dictionaries[lang]?.[key]||locale.dictionaries.en[key]||key;
  document.documentElement.lang=lang;
  const $=id=>document.getElementById(id);
  $('name').textContent=station.name;
  $('metadata').textContent=[station.country,station.genre,station.codec,station.bitrate?`${station.bitrate} kbps`:'',station.frequency].filter(Boolean).join(' · ');
  if(station.logo){$('logo').src=/^https?:\/\//i.test(station.logo)?station.logo:`../../assets/icons/${station.logo}`;$('logo').hidden=false;$('logo').onerror=()=>$('logo').hidden=true;}
  let audio, context, analyser, retry, generation=0, wanted=true, cors=true;
  const canvas=$('wave'),ctx=canvas.getContext('2d');
  function draw(){requestAnimationFrame(draw);ctx.clearRect(0,0,canvas.width,canvas.height);if(!analyser||!audio||audio.paused)return;const data=new Uint8Array(analyser.frequencyBinCount);analyser.getByteFrequencyData(data);ctx.fillStyle='#58d68d';for(let i=0;i<100;i++){const h=data[i]/255*canvas.height;ctx.fillRect(i*10,(canvas.height-h)/2,7,h);}}
  draw();
  function status(text){$('status').textContent=text;}
  function stop(){generation++;clearTimeout(retry);if(audio){audio.pause();audio.removeAttribute('src');audio.load();}if(context)context.close().catch(()=>{});context=analyser=null;}
  function start(){stop();if(!wanted)return;const token=generation;audio=new Audio();if(cors)audio.crossOrigin='anonymous';audio.src=station.url;status(t('Connecting to radio station...'));
    const fail=()=>{if(token!==generation||!wanted)return;if(cors){cors=false;start();return;}status(t('Reconnecting...'));clearTimeout(retry);retry=setTimeout(start,5000);};
    audio.addEventListener('error',fail);audio.addEventListener('ended',fail);
    audio.addEventListener('playing',()=>{if(token!==generation)return;status(cors?t('Live radio'):t('Live radio — visualization unavailable'));});
    if(cors){try{context=new AudioContext();analyser=context.createAnalyser();analyser.fftSize=512;context.createMediaElementSource(audio).connect(analyser);analyser.connect(context.destination);context.resume().catch(()=>{});}catch{cors=false;start();return;}}
    audio.play().catch(fail);
  }
  function toggle(){wanted=!wanted;if(wanted){$('play').textContent='⏸';start();}else{stop();$('play').textContent='▶';status(t('Paused'));}}
  for(const [id,label,action] of [['home',t('Back to TV'),()=>api.radioHome()],['previous',t('Previous station'),()=>api.radioStep(-1)],['next',t('Next station'),()=>api.radioStep(1)],['play',t('Play or pause'),toggle]]){$(id).title=label;$(id).setAttribute('aria-label',label);$(id).onclick=action;}
  document.addEventListener('keydown',e=>{if(e.code==='Space'&&e.target.tagName!=='BUTTON'){e.preventDefault();toggle();}});
  window.addEventListener('pagehide',()=>{wanted=false;stop();});$('play').textContent='⏸';start();
})().catch(console.error);
