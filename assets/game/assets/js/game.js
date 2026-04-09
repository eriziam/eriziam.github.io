console.log("%cYou are playing TBG by Eryk Kirzanowski", "color:green; text-decoration: underline");
/* Script Description
  This script creates is a very simple game...

  Developer : Eryk Kirzanowski
  Github : @Nobzie
*/

// Manage all statistics
var hp;
var cp;
var xp;
var gp;
var maxhp;
var level;

hp = 20;
maxhp = 20;
cp = 1;
xp = 0;
gp = 0;
level = 1;

// Equipment stats
var weaponPower = 0;
var armorDef = 0;

// Item database with effects
var items = {
    1: { name: "Stick", type: "weapon", power: 1, desc: "+1 ATK" },
    2: { name: "Rock", type: "weapon", power: 2, desc: "+2 ATK" },
    3: { name: "Apple", type: "consumable", heal: 5, desc: "+5 HP" },
    4: { name: "Wooden Sword", type: "weapon", power: 3, desc: "+3 ATK" },
    5: { name: "Iron Sword", type: "weapon", power: 5, desc: "+5 ATK" },
    6: { name: "Bread", type: "consumable", heal: 10, desc: "+10 HP" },
    7: { name: "Leather Armor", type: "armor", def: 1, desc: "+1 DEF" },
    8: { name: "Iron Armor", type: "armor", def: 3, desc: "+3 DEF" },
    9: { name: "Potion", type: "consumable", heal: 20, desc: "+20 HP" },
    10: { name: "Gold Coin", type: "treasure", value: 10, desc: "10 GP" }
};

// Enemies
var enemies = [
    { name: "Rat", hp: 5, atk: 1, xp: 5, gp: 2 },
    { name: "Slime", hp: 8, atk: 2, xp: 10, gp: 5 },
    { name: "Goblin", hp: 12, atk: 3, xp: 15, gp: 8 },
    { name: "Wolf", hp: 15, atk: 4, xp: 20, gp: 10 },
    { name: "Skeleton", hp: 20, atk: 5, xp: 30, gp: 15 }
];

var inventory = ["", "", "", "", "", "", "", "", ""];
var equipped = { weapon: null, armor: null, ring: null, special: null };

var mainLoop = setInterval(function(){
  document.getElementById("hp").innerText = hp + "/" + maxhp;
  document.getElementById("cp").innerText = cp;
  document.getElementById("xp").innerText = xp + " (Lv" + level + ")";
  document.getElementById("gp").innerText = gp;

  if(hp > maxhp) hp = maxhp;
  if(hp < 1) die();
  if(xp >= level * 50) levelUp();
}, 100);

function levelUp() {
    level++;
    maxhp += 5;
    hp = maxhp;
    cp++;
    log("<b id='green'>LEVEL UP! You are now level " + level + "!</b>");
}

// Commands
var txt;

function explore() {
    var roll = Math.floor(Math.random() * 12);
    
    if (roll === 1) {
        findItem(1);
    } else if (roll === 2) {
        findItem(2);
    } else if (roll === 3) {
        findItem(3);
    } else if (roll === 4) {
        txt = "<b id='red'>You stumbled and lost 1 HP!</b>";
        hp -= 1;
    } else if (roll === 5 || roll === 6) {
        fightEnemy();
    } else if (roll === 7) {
        findItem(10);
    } else {
        txt = "You found nothing...";
    }
    
    if (!txt) txt = "You explore the area...";
    xp += 1;
    log(txt);
}

function findItem(itemId) {
    var item = items[itemId];
    if (item.type === "treasure") {
        gp += item.value;
        txt = "You found <b id='yellow'>" + item.value + " Gold</b>!";
    } else {
        giveItem(itemId);
        txt = "You found a <b id='green'>" + item.name + "</b>!";
    }
}

function fightEnemy() {
    var enemy = enemies[Math.floor(Math.random() * enemies.length)];
    var dmg = Math.max(1, cp + weaponPower - enemy.atk + armorDef);
    var enemyDmg = Math.max(0, enemy.atk - armorDef);
    
    txt = "A wild <b id='red'>" + enemy.name + "</b> appeared! ";
    txt += "(You deal " + dmg + ", it deals " + enemyDmg + ") ";
    
    if (dmg >= enemy.hp) {
        xp += enemy.xp;
        gp += enemy.gp;
        txt += "<b id='green'>You won! +" + enemy.xp + " XP, +" + enemy.gp + " GP</b>";
    } else {
        hp -= enemyDmg;
        txt += "<b id='red'>You took " + enemy.dmg + " damage!</b>";
    }
}

function quest() {
    var quests = [
        "Defeat 3 Rats in the cellar",
        "Collect 5 Gold from the mountain",
        "Explore the ancient dungeon"
    ];
    txt = "Available Quests:<br> - " + quests.join("<br> - ");
    log(txt);
}

function log(msg) {
    document.getElementById("out").innerHTML += msg + "<br>";
}

function giveItem(id) {
    for (var i = 0; i < inventory.length; i++) {
        if (inventory[i] === "") {
            inventory[i] = id;
            updateInventory();
            return;
        }
    }
    log("<b id='red'>Inventory full!</b>");
}

function useItem(slot) {
    var itemId = inventory[slot];
    if (!itemId) return;
    
    var item = items[itemId];
    if (item.type === "consumable") {
        hp += item.heal;
        inventory[slot] = "";
        log("You used " + item.name + ". " + item.desc);
    } else if (item.type === "weapon") {
        equipped.weapon = itemId;
        weaponPower = item.power;
        log("Equipped " + item.name + ". " + item.desc);
    } else if (item.type === "armor") {
        equipped.armor = itemId;
        armorDef = item.def;
        log("Equipped " + item.name + ". " + item.desc);
    }
    updateInventory();
}

function updateInventory() {
    for (var i = 0; i < 8; i++) {
        var el = document.getElementById("inv" + i);
        if (inventory[i]) {
            el.innerText = items[inventory[i]].name;
        } else {
            el.innerText = "";
        }
    }
}

// Game Over
function die() {
  clearInterval(mainLoop);
  document.getElementById("out").innerHTML += "<b id='red'>===== YOU DIED! =====</b><br>";
  document.getElementById("out").innerHTML += "<b id='yellow'>Final Score: Level " + level + ", " + xp + " XP, " + gp + " GP</b><br>";
  document.getElementById("out").innerHTML += "<br><button onclick='location.reload()'>Restart</button><br>";
}
