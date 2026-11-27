(function(){
  document.querySelectorAll('.nav a').forEach(function(a){a.addEventListener('click',function(){document.body.classList.remove('nav-open')})});
})();
