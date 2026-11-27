(function(){
  var root=document.documentElement;
  document.querySelectorAll('.nav a').forEach(function(a){a.addEventListener('click',function(){document.body.classList.remove('nav-open')})});

  // Light and dark switch. Remembers the visitor's choice on this device.
  var t=document.querySelector('.theme-toggle');
  function isDark(){
    if(root.dataset.theme)return root.dataset.theme==='dark';
    var m=t&&t.dataset.mode;
    if(m==='dark')return true;
    if(m==='light')return false;
    return matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function sync(){document.body.classList.toggle('theme-dark',isDark());if(t)t.setAttribute('aria-pressed',String(isDark()))}
  if(t){
    t.addEventListener('click',function(){
      var next=isDark()?'light':'dark';root.dataset.theme=next;
      try{localStorage.setItem('gco-theme',next)}catch(e){}
      sync();
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change',sync);
  }
  sync();

  // Contact form: send without leaving the page (falls back to a normal post without JavaScript)
  var f=document.querySelector('form[data-contact]');
  if(!f||!window.fetch)return;
  var status=f.querySelector('.cf-status'),btn=f.querySelector('button[type=submit]');
  f.addEventListener('submit',function(e){
    e.preventDefault();
    var data={};new FormData(f).forEach(function(v,k){data[k]=v});
    btn.disabled=true;btn.textContent='Sending...';status.className='cf-status';status.textContent='';
    fetch('/api/public/contact',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)})
      .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})})
      .then(function(res){
        if(!res.ok)throw new Error(res.j.error||'Something went wrong.');
        f.reset();status.className='cf-status ok';status.textContent=res.j.message;
      })
      .catch(function(err){status.className='cf-status err';status.textContent=err.message+' You can also email me directly.'})
      .finally(function(){btn.disabled=false;btn.textContent='Send message'});
  });
})();
