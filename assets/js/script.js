<<<<<<< HEAD
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
=======
// Navbar scroll effect
const navbar = document.querySelector('.navbar');
let ticking = false;

function onScroll() {
  if (window.scrollY > 50) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
}

window.addEventListener('scroll', () => {
  if (!ticking) {
    window.requestAnimationFrame(() => {
      onScroll();
      ticking = false;
    });
    ticking = true;
  }
});

onScroll();

// Mobile menu toggle
const menuBtn = document.querySelector('.mobile-menu-btn');
const navLinks = document.querySelector('.nav-links');

if (menuBtn && navLinks) {
  menuBtn.addEventListener('click', () => {
    navLinks.classList.toggle('active');
    const icon = menuBtn.querySelector('i');
    icon.classList.toggle('fa-bars');
    icon.classList.toggle('fa-times');
  });

  // Close menu when clicking a link
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('active');
      menuBtn.querySelector('i').classList.add('fa-bars');
      menuBtn.querySelector('i').classList.remove('fa-times');
    });
  });
>>>>>>> recovery/Revamp
}