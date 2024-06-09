switcher = "0"; 

function darkness() {       
        if (switcher == "0") {
            var head  = document.getElementsByTagName('head')[0];
            var link  = document.createElement('link');
            link.id   = 'dark';
            link.rel  = 'stylesheet';
            link.type = 'text/css';
            link.href = 'http://eriz.atwebpages.com/assets/css/dark-theme.css';
            link.media = 'all';
            switcher = "1";
            head.appendChild(link);
        } else if (switcher == "1") {
            document.getElementById('dark').outerHTML = "";
            switcher = "0";
        }
}
