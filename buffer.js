import {Buffer} from 'buffer';

const buffer = Buffer.from("ABC");

console.log(buffer,'buffer')
console.log(buffer[0] , 'buffer')
console.log(buffer[1] , 'buffer')
console.log(buffer[2] , 'buffer')

console.log(buffer.toString(),'toString()')

const data = Buffer.from([10,20,30]);

// You can modify the bytes, but you cannot increase the Buffer's length.

console.log(data,'dataaaa')
console.log(data[0]);
console.log(data[1]);
console.log(data[2]);

const buffer1 = Buffer.alloc(10);

console.log(buffer1,'buffer1');

const buffer2 = Buffer.allocUnsafe(5);

console.log(buffer2,'buffer2');