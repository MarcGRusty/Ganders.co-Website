(function(){
  document.querySelectorAll('.nav a').forEach(function(a){a.addEventListener('click',function(){document.body.classList.remove('nav-open')})});
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
