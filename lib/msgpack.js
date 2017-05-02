var msgpack = require("msgpack-lite");

let data = {
	now: new Date()
}
// console.log(data, typeof data.now);
var encoded = msgpack.encode(data);
// console.log(encoded, typeof encoded);
var decoded = msgpack.decode(encoded);
// console.log(decoded, typeof decoded.now, decoded.now.getTime());




// var codec = msgpack.createCodec({preset: true});
// var codec = msgpack.createCodec();

// codec.addExtPacker(0x3F, Date, myDatePacker);
// codec.addExtUnpacker(0x3F, myDateUnpacker);


// var encoded = msgpack.encode(data, {codec: codec});
// var decoded = msgpack.decode(encoded, {codec: codec});



// function myDatePacker(date) {
//   var array = date.getTime();
//   return msgpack.encode(array); // return Buffer serialized
// }

// function myDateUnpacker(buffer) {
//   var array = msgpack.decode(buffer);
//   return new Date(array); // return Object deserialized
// }