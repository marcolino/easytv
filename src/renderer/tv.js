(async()=>{
 const api=window.easyTV, $=id=>document.getElementById(id);
 const [info,prefs,locale]=await Promise.all([api.currentDirectTV(),api.getPreferences(),api.getI18n()]);
 if(!info)return;
 const lang=prefs.language==='auto'?locale.systemLanguage:prefs.language;
 const t=key=>locale.dictionaries[lang]?.[key]||key;
 const video=$('video'); let hls, timer, lastProgress=Date.now(), lastTime=-1, attempts=0, failed=false, retryTimer, generation=0;
 $('name').textContent=info.channel.name; $('web').textContent=t('Official player'); $('retry').textContent=t('Retry'); for(const id of ['web','retry']) {$(id).title=$(id).textContent;$(id).setAttribute('aria-label',$(id).title);}
 $('web').hidden=!info.channel.url; $('web').onclick=()=>api.directTVWeb(); $('retry').onclick=()=>{attempts=0;start();};
 function reveal(){document.body.classList.remove('idle');$('overlay').classList.remove('hidden');clearTimeout(timer);if(!failed)timer=setTimeout(()=>{if(!failed){document.body.classList.add('idle');$('overlay').classList.add('hidden');}},2500);}
 for(const event of ['pointermove','pointerdown','keydown','focusin'])document.addEventListener(event,reveal);
 function stop(){generation++;clearTimeout(retryTimer);if(hls){hls.destroy();hls=null;}video.pause();video.removeAttribute('src');video.load();}
 function fail(reason){if(failed)return;failed=true;console.warn('Direct TV:',reason);stop();$('status').textContent=t('Reconnecting...');reveal();if(attempts++<2){retryTimer=setTimeout(start,3000);return;}if(info.mode==='auto'){api.directTVWeb();return;}$('status').textContent=t('Direct streaming failed');}
 function start(){stop();failed=false;lastProgress=Date.now();lastTime=-1;$('status').textContent=t('Connecting to TV channel...');reveal();const token=generation;
 if(!window.Hls?.isSupported()){fail('HLS/MSE unavailable');return;}
 hls=new Hls({enableWorker:true});hls.on(Hls.Events.ERROR,(_e,data)=>{console.warn('HLS',data.type,data.details,data.fatal);if(data.fatal&&token===generation)fail(data.details);});
 hls.on(Hls.Events.MANIFEST_PARSED,()=>{if(token===generation)video.play().catch(e=>fail(e.message));});hls.loadSource(info.channel.directUrl);hls.attachMedia(video);
 }
 video.addEventListener('playing',()=>{$('status').textContent=t('Live TV');reveal();});
 video.addEventListener('resize',()=>{$('quality').textContent=video.videoHeight?`${video.videoWidth} × ${video.videoHeight}`:'';});
 const banner=$('channel-banner'); banner.textContent=info.channel.name;
 function fitBanner(){banner.style.fontSize='46vh'; const textWidth=document.createRange(); textWidth.selectNodeContents(banner); const measured=textWidth.getBoundingClientRect().width; if(measured>innerWidth*.92)banner.style.fontSize=(innerHeight*.46*innerWidth*.92/measured)+'px';}
 video.addEventListener('playing',()=>{fitBanner();banner.classList.add('visible');setTimeout(()=>banner.classList.remove('visible'),1500);},{once:true});
 const watchdog=setInterval(()=>{if(failed)return;if(video.currentTime!==lastTime){lastTime=video.currentTime;lastProgress=Date.now();}else if(Date.now()-lastProgress>20000)fail('No playback progress');},1000);
 window.addEventListener('pagehide',()=>{clearInterval(watchdog);clearTimeout(timer);stop();});start();
})().catch(console.error);
