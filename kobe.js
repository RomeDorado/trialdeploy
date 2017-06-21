const fs = require('fs');
/*
var data = fs.readFileSync('./files/directory', 'utf8');
var dir = [] = data.split(" ");
var email_address = dir[0];
var role = dir[1];

//console.log(email_address + " " + role);
var Arry = [];
var email = "romedorado@gmail.com";
var lineReader = require('readline').createInterface({
  input: require('fs').createReadStream('./files/directory')
});

lineReader.on('line', function (line) {
    Arry.push(line);
  console.log(line);
});

lineReader.on('close', function (line) {
for(var x =0; x < Arry.length; x++){
   if (Arry[x] == 'cat'){

      console.log("wow");


    }
    else{
        console.log("nah");
    }
}
});
*/
console.log("before");
var Arry = [];
var lineReader = require('readline').createInterface({  
input: require('fs').createReadStream('./files/directory')
});

lineReader.on('line', function (line) {
Arry.push(line);
});

lineReader.on('close', function (line) {

var Ncount = 0;

for(var i = 0; i < i.length; i += 2) {  // take every second element
    ar.push(a[i]);
}


for(var x = 0; x < Arry.length; x+=1){
//console.log(Arry[x]);
   if (Arry[x] == 'patco@gmail.com'){

      console.log("wow " + Arry[x]); 
      console.log(Arry[x+1]);
    

    }else{
        console.log('try again');
    }

  }


});
console.log("after");

