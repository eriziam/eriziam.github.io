var ver = "a0.0.2";

function initialize() {
  var head = document.getElementsByTagName('HEAD')[0];
  var script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'assets/js/game.js';
  head.appendChild(script);

  document.getElementById("out").innerHTML += "Current version " + ver + "<br>";
  document.getElementById("out").innerHTML += "============================================" + "<br>";
}
