console.log('peek-a-boo'); // a warm welcome

function openTab(tabId) {
        var one = "WorkExperience";
        var two = "Projects";
        var three = "PersonalStatement";
        var four = "Education";
        var s = "section ";
        
        // very lazy way of doing it
        if (tabId == "WorkExperience") {
                document.getElementById(tabId).setAttribute("class", s+"shown");
                document.getElementById(two).setAttribute("class", s+"hidden");
                document.getElementById(three).setAttribute("class", s+"hidden");
                document.getElementById(four).setAttribute("class", s+"hidden");
        } else if (tabId == "Projects") {
                document.getElementById(tabId).setAttribute("class", s+"shown");
                document.getElementById(one).setAttribute("class", s+"hidden");
                document.getElementById(three).setAttribute("class", s+"hidden");
                document.getElementById(four).setAttribute("class", s+"hidden");
        } else if (tabId == "PersonalStatement") {
                document.getElementById(tabId).setAttribute("class", s+"shown");
                document.getElementById(one).setAttribute("class", s+"hidden");
                document.getElementById(two).setAttribute("class", s+"hidden");
                document.getElementById(four).setAttribute("class", s+"hidden");
        } else if (tabId == "Education") {
                document.getElementById(tabId).setAttribute("class", s+"shown");
                document.getElementById(one).setAttribute("class", s+"hidden");
                document.getElementById(two).setAttribute("class", s+"hidden");
                document.getElementById(three).setAttribute("class", s+"hidden");
        } else if (tabId == "None") {
                document.getElementById(one).setAttribute("class", s+"hidden");
                document.getElementById(two).setAttribute("class", s+"hidden");
                document.getElementById(three).setAttribute("class", s+"hidden");
                document.getElementById(four).setAttribute("class", s+"hidden");
        }
}