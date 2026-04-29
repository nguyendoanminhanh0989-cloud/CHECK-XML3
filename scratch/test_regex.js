const str = "202604200736";
console.log(str.match(/(?:^|\D)(\d{12})(?:\D|$)/));

const str2 = "'202604200736";
console.log(str2.match(/(?:^|\D)(\d{12})(?:\D|$)/));
