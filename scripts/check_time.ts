
const start = 1765719760;
const graceHrs = 1;
const graceEnd = start + (graceHrs * 3600);
const now = Math.floor(Date.now() / 1000);

console.log("Start:", start, new Date(start * 1000).toLocaleString());
console.log("Grace End:", graceEnd, new Date(graceEnd * 1000).toLocaleString());
console.log("Now:", now, new Date(now * 1000).toLocaleString());

const diff = now - graceEnd;
console.log("Seconds since Grace End:", diff);
console.log("Hours since Grace End (Math.floor(diff / 3600)):", Math.floor(diff / 3600));

if (diff < 0) {
  console.log("Result: Still in Grace Period.");
} else if (Math.floor(diff / 3600) === 0) {
  console.log("Result: Grace Period over, but waiting for full penalty hour completion.");
} else {
  console.log("Result: Should trigger penalty.");
}
