import {Buffer} from 'buffer';

const data = Buffer.from("Hello");

console.log(data , 'dayatatata')

console.log(data.toString("utf-8"));
console.log(data.length);

const emptyBuffer = Buffer.alloc(10);

console.log(emptyBuffer,'emptyBuffer')