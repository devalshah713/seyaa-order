// India price master for Stock In, decoded from the owner's "Stock Sheet New
// For India" rate card. Each product code has a per-carat Price ($)/(₹); the
// dropdown shows Product Code : Sieve/Size : Pointers for verification, and
// stores only the code. Gold & Labour are per gram (by karat); Polki pieces use
// the Polki Labour rate. THIS FILE IS PARTLY GENERATED FROM THE RATE CARD.

export type PriceCategory = "Round" | "Fancy" | "Gem" | "Polki";
export type PriceEntry = {
  code: string;
  label: string;       // descriptive name
  category: PriceCategory;
  sieve: string;       // sieve grade (Round) or shape+mm (Fancy) or size (Gem/Polki)
  pointers: string;    // per-stone ct (Round) or ct range (Fancy); blank for Gem/Polki
  usd: number;         // per carat
  inr: number;         // per carat
  polki?: boolean;
};

const ROUND: PriceEntry[] = [
  {"code":"10/2 : 01","label":"Round 10/2 Certified","category":"Round","sieve":"10/2 Certified","pointers":"5.00 - 10.00","usd":250,"inr":20000},
  {"code":"8/2 : 01","label":"Round 8/2","category":"Round","sieve":"8/2","pointers":"4.00 - 4.99","usd":200,"inr":15000},
  {"code":"6/2 : 01","label":"Round 6/2","category":"Round","sieve":"6/2","pointers":"3.00 - 3.99","usd":200,"inr":15000},
  {"code":"4/2 : 01","label":"Round 4/2","category":"Round","sieve":"4/2","pointers":"2.00 - 2.99","usd":180,"inr":15000},
  {"code":"6/4 : 01","label":"Round 6/4","category":"Round","sieve":"6/4","pointers":"1.50 - 1.99","usd":160,"inr":15000},
  {"code":"4/4 : 02","label":"Round 4/4","category":"Round","sieve":"4/4","pointers":"1.26 - 1.49","usd":120,"inr":15000},
  {"code":"4/4 : 01","label":"Round 4/4","category":"Round","sieve":"4/4","pointers":"1.00 - 1.25","usd":120,"inr":10500},
  {"code":"7/8 : 02","label":"Round 7/8","category":"Round","sieve":"7/8","pointers":"0.90 - 0.99","usd":100,"inr":10500},
  {"code":"7/8 : 01","label":"Round 7/8","category":"Round","sieve":"7/8","pointers":"0.80 - 0.89","usd":100,"inr":9000},
  {"code":"3/4 : 05","label":"Round 3/4","category":"Round","sieve":"3/4","pointers":"0.770","usd":100,"inr":9000},
  {"code":"3/4 : 04","label":"Round 3/4","category":"Round","sieve":"3/4","pointers":"0.750","usd":100,"inr":9000},
  {"code":"3/4 : 03","label":"Round 3/4","category":"Round","sieve":"3/4","pointers":"0.720","usd":100,"inr":9000},
  {"code":"3/4 : 02","label":"Round 3/4","category":"Round","sieve":"3/4","pointers":"0.710","usd":100,"inr":9000},
  {"code":"3/4 : 01","label":"Round 3/4","category":"Round","sieve":"3/4","pointers":"0.670","usd":100,"inr":9000},
  {"code":"5/8 : 03","label":"Round 5/8","category":"Round","sieve":"5/8","pointers":"0.630","usd":100,"inr":9000},
  {"code":"5/8 : 02","label":"Round 5/8","category":"Round","sieve":"5/8","pointers":"0.580","usd":100,"inr":9000},
  {"code":"5/8 : 01","label":"Round 5/8","category":"Round","sieve":"5/8","pointers":"0.570","usd":100,"inr":9000},
  {"code":"1/2 : 03","label":"Round 1/2","category":"Round","sieve":"1/2","pointers":"0.520","usd":100,"inr":8500},
  {"code":"1/2 : 02","label":"Round 1/2","category":"Round","sieve":"1/2","pointers":"0.500","usd":100,"inr":8500},
  {"code":"1/2 : 01","label":"Round 1/2","category":"Round","sieve":"1/2","pointers":"0.470","usd":100,"inr":8500},
  {"code":"3/8 : 04","label":"Round 3/8","category":"Round","sieve":"3/8","pointers":"0.420","usd":100,"inr":8500},
  {"code":"3/8 : 03","label":"Round 3/8","category":"Round","sieve":"3/8","pointers":"0.400","usd":100,"inr":8500},
  {"code":"3/8 : 02","label":"Round 3/8","category":"Round","sieve":"3/8","pointers":"0.375","usd":100,"inr":8500},
  {"code":"3/8 : 01","label":"Round 3/8","category":"Round","sieve":"3/8","pointers":"0.350","usd":100,"inr":8500},
  {"code":"+19-20 : 02","label":"Round +19.5-20","category":"Round","sieve":"+19.5-20","pointers":"0.335","usd":100,"inr":7500},
  {"code":"+19-20 : 01","label":"Round +19-19.5","category":"Round","sieve":"+19-19.5","pointers":"0.305","usd":100,"inr":7500},
  {"code":"+17-19 : 04","label":"Round +18.5-19","category":"Round","sieve":"+18.5-19","pointers":"0.270","usd":100,"inr":7500},
  {"code":"+17-19 : 03","label":"Round +18-18.5","category":"Round","sieve":"+18-18.5","pointers":"0.250","usd":100,"inr":7500},
  {"code":"+17-19 : 02","label":"Round +17.5-18","category":"Round","sieve":"+17.5-18","pointers":"0.245","usd":100,"inr":7500},
  {"code":"+17-19 : 01","label":"Round +17-17.5","category":"Round","sieve":"+17-17.5","pointers":"0.230","usd":100,"inr":7500},
  {"code":"+16-17 : 02","label":"Round +16.5-17","category":"Round","sieve":"+16.5-17","pointers":"0.218","usd":100,"inr":7000},
  {"code":"+16-17 : 01","label":"Round +16-16.5","category":"Round","sieve":"+16-16.5","pointers":"0.180","usd":100,"inr":7000},
  {"code":"+15-16 : 02","label":"Round +15.5-16","category":"Round","sieve":"+15.5-16","pointers":"0.175","usd":100,"inr":7000},
  {"code":"+15-16 : 01","label":"Round +15-15.5","category":"Round","sieve":"+15-15.5","pointers":"0.159","usd":100,"inr":7000},
  {"code":"+14-15 : 02","label":"Round +14.5-15","category":"Round","sieve":"+14.5-15","pointers":"0.146","usd":100,"inr":7000},
  {"code":"+14-15 : 01","label":"Round +14-14.5","category":"Round","sieve":"+14-14.5","pointers":"0.135","usd":100,"inr":7000},
  {"code":"+11-14 : 06","label":"Round +13.5-14","category":"Round","sieve":"+13.5-14","pointers":"0.125","usd":78,"inr":7000},
  {"code":"+11-14 : 05","label":"Round +13-13.5","category":"Round","sieve":"+13-13.5","pointers":"0.116","usd":78,"inr":7000},
  {"code":"+11-14 : 04","label":"Round +12.5-13","category":"Round","sieve":"+12.5-13","pointers":"0.108","usd":82,"inr":7000},
  {"code":"+11-14 : 03","label":"Round +12-12.5","category":"Round","sieve":"+12-12.5","pointers":"0.095","usd":82,"inr":7000},
  {"code":"+11-14 : 02","label":"Round +11.5-12","category":"Round","sieve":"+11.5-12","pointers":"0.086","usd":75,"inr":7000},
  {"code":"+11-14 : 01","label":"Round +11-11.5","category":"Round","sieve":"+11-11.5","pointers":"0.078","usd":75,"inr":7000},
  {"code":"+6.5-11 : 09","label":"Round +10.5-11","category":"Round","sieve":"+10.5-11","pointers":"0.074","usd":75,"inr":7000},
  {"code":"+6.5-11 : 08","label":"Round +10-10.5","category":"Round","sieve":"+10-10.5","pointers":"0.069","usd":75,"inr":7000},
  {"code":"+6.5-11 : 07","label":"Round +9.5-10","category":"Round","sieve":"+9.5-10","pointers":"0.058","usd":75,"inr":7000},
  {"code":"+6.5-11 : 06","label":"Round +9-9.5","category":"Round","sieve":"+9-9.5","pointers":"0.052","usd":75,"inr":7000},
  {"code":"+6.5-11 : 05","label":"Round +8.5-9","category":"Round","sieve":"+8.5-9","pointers":"0.044","usd":82,"inr":7000},
  {"code":"+6.5-11 : 04","label":"Round +8-8.5","category":"Round","sieve":"+8-8.5","pointers":"0.039","usd":82,"inr":7000},
  {"code":"+6.5-11 : 03","label":"Round +7.5-8","category":"Round","sieve":"+7.5-8","pointers":"0.035","usd":95,"inr":7000},
  {"code":"+6.5-11 : 02","label":"Round +7-7.5","category":"Round","sieve":"+7-7.5","pointers":"0.029","usd":95,"inr":7000},
  {"code":"+6.5-11 : 01","label":"Round +6.5-7","category":"Round","sieve":"+6.5-7","pointers":"0.025","usd":95,"inr":7000},
  {"code":"+2-6.5 : 09","label":"Round +6-6.5","category":"Round","sieve":"+6-6.5","pointers":"0.021","usd":110,"inr":7750},
  {"code":"+2-6.5 : 08","label":"Round +5.5-6","category":"Round","sieve":"+5.5-6","pointers":"0.018","usd":110,"inr":7750},
  {"code":"+2-6.5 : 07","label":"Round +5-5.5","category":"Round","sieve":"+5-5.5","pointers":"0.016","usd":110,"inr":7750},
  {"code":"+2-6.5 : 06","label":"Round +4.5-5","category":"Round","sieve":"+4.5-5","pointers":"0.014","usd":110,"inr":7750},
  {"code":"+2-6.5 : 05","label":"Round +4-4.5","category":"Round","sieve":"+4-4.5","pointers":"0.013","usd":110,"inr":7750},
  {"code":"+2-6.5 : 04","label":"Round +3.5-4","category":"Round","sieve":"+3.5-4","pointers":"0.012","usd":110,"inr":9000},
  {"code":"+2-6.5 : 03","label":"Round +3-3.5","category":"Round","sieve":"+3-3.5","pointers":"0.011","usd":110,"inr":9000},
  {"code":"+2-6.5 : 02","label":"Round +2.5-3","category":"Round","sieve":"+2.5-3","pointers":"0.010","usd":110,"inr":9000},
  {"code":"+2-6.5 : 01","label":"Round +2-2.5","category":"Round","sieve":"+2-2.5","pointers":"0.009","usd":110,"inr":9000},
  {"code":"-2 : 06","label":"Round +1.5-2","category":"Round","sieve":"+1.5-2","pointers":"0.008","usd":160,"inr":11000},
  {"code":"-2 : 05","label":"Round +1-1.5","category":"Round","sieve":"+1-1.5","pointers":"0.007","usd":160,"inr":11000},
  {"code":"-2 : 04","label":"Round +0-1","category":"Round","sieve":"+0-1","pointers":"0.006","usd":160,"inr":11000},
  {"code":"-2 : 03","label":"Round +00-0","category":"Round","sieve":"+00-0","pointers":"0.005","usd":160,"inr":15000},
  {"code":"-2 : 02","label":"Round +000-00","category":"Round","sieve":"+000-00","pointers":"0.004","usd":160,"inr":15000},
  {"code":"-2 : 01","label":"Round +0000-000","category":"Round","sieve":"+0000-000","pointers":"0.003","usd":160,"inr":15000},
];

const FANCY: PriceEntry[] = [
  {"code":"OV : 04","label":"Oval Pink (10.00 - 10.99 ct)","category":"Fancy","sieve":"Oval Pink","pointers":"10.00 - 10.99","usd":250,"inr":21000},
  {"code":"OV : 03","label":"Oval (10.00 - 10.99 ct)","category":"Fancy","sieve":"Oval","pointers":"10.00 - 10.99","usd":250,"inr":20000},
  {"code":"HE : 02","label":"Heart (1.00 - 4.99 ct)","category":"Fancy","sieve":"Heart 6.50 - 7.40","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"HE : 01","label":"Heart (0.01 - 0.99 ct)","category":"Fancy","sieve":"Heart 3.50 - 6.50","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"HEB : 02","label":"Hexagon Bullet (1.00 - 4.99 ct)","category":"Fancy","sieve":"Hexagon Bullet 8.22*5.67 - 14.05*9.69","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"HEB : 01","label":"Hexagon Bullet (0.01 - 0.99 ct)","category":"Fancy","sieve":"Hexagon Bullet 1.77*1.22 - 8.20*5.65","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"KE : 02","label":"Keystone (1.00 - 4.99 ct)","category":"Fancy","sieve":"Keystone","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"KE : 01","label":"Keystone (0.01 - 0.99 ct)","category":"Fancy","sieve":"Keystone","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"BU : 02","label":"Bullet (1.00 - 4.99 ct)","category":"Fancy","sieve":"Bullet 8.55*4.27 - 14.61*7.30","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"BU : 01","label":"Bullet (0.01 - 0.99 ct)","category":"Fancy","sieve":"Bullet 1.84*0.92 - 8.52*4.26","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"LOZ : 02","label":"Lozenge (1.00 - 4.99 ct)","category":"Fancy","sieve":"Lozenge 10.36*6.09 - 17.70*10.41","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"LOZ : 01","label":"Lozenge (0.01 - 0.99 ct)","category":"Fancy","sieve":"Lozenge 2.23*1.31 - 10.32*6.07","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"SH : 02","label":"Shield (1.00 - 4.99 ct)","category":"Fancy","sieve":"Shield 7.45*5.32 - 12.73*9.09","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"SH : 01","label":"Shield (0.01 - 0.99 ct)","category":"Fancy","sieve":"Shield 1.60*1.15 - 7.42*5.30","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"BA : 02","label":"Barrel (1.00 - 4.99 ct)","category":"Fancy","sieve":"Barrel","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"BA : 01","label":"Barrel (0.01 - 0.99 ct)","category":"Fancy","sieve":"Barrel","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"OC : 02","label":"Octagon (1.00 - 4.99 ct)","category":"Fancy","sieve":"Octagon","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"OC : 01","label":"Octagon (0.01 - 0.99 ct)","category":"Fancy","sieve":"Octagon","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"HEX : 02","label":"Hexagon (1.00 - 4.99 ct)","category":"Fancy","sieve":"Hexagon 6.71*5.83 - 11.46*9.97","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"HEX : 01","label":"Hexagon (0.01 - 0.99 ct)","category":"Fancy","sieve":"Hexagon 1.45*1.26 - 6.69*5.81","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"PEN : 02","label":"Pentagon (1.00 - 4.99 ct)","category":"Fancy","sieve":"Pentagon","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"PEN : 01","label":"Pentagon (0.01 - 0.99 ct)","category":"Fancy","sieve":"Pentagon","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"CH : 02","label":"Chill (1.00 - 4.99 ct)","category":"Fancy","sieve":"Chill","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"CH : 01","label":"Chill (0.01 - 0.99 ct)","category":"Fancy","sieve":"Chill","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"KI : 02","label":"Kite (1.00 - 4.99 ct)","category":"Fancy","sieve":"Kite 11.26*5.63 - 19.25*9.62","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"KI : 01","label":"Kite (0.01 - 0.99 ct)","category":"Fancy","sieve":"Kite 2.43*1.21 - 11.22*5.61","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"PE : 02","label":"Pear (Pan) (1.00 - 4.99 ct)","category":"Fancy","sieve":"Pear (Pan) 8.48*5.65 - 14.49*9.66","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"PE : 01","label":"Pear (Pan) (0.01 - 0.99 ct)","category":"Fancy","sieve":"Pear (Pan) 1.78*1.19 - 8.45*5.63","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"CU : 02","label":"Cushion (1.00 - 4.99 ct)","category":"Fancy","sieve":"Cushion 5.84*5.56 - 9.98*9.50","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"CU : 01","label":"Cushion (0.01 - 0.99 ct)","category":"Fancy","sieve":"Cushion 1.26*1.20 - 5.82*5.54","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"OV : 02","label":"Oval (1.00 - 4.99 ct)","category":"Fancy","sieve":"Oval 7.80*5.78 - 13.32*9.87","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"OV : 01","label":"Oval (0.01 - 0.99 ct)","category":"Fancy","sieve":"Oval 1.65*1.22 - 7.77*5.76","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"MQ : 02","label":"Marquise (1.00 - 4.99 ct)","category":"Fancy","sieve":"Marquise 10.69*5.34 - 18.26*9.13","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"MQ : 01","label":"Marquise (0.01 - 0.99 ct)","category":"Fancy","sieve":"Marquise 2.24*1.12 - 10.65*5.33","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"RAD : 02","label":"Radiant (1.00 - 4.99 ct)","category":"Fancy","sieve":"Radiant 6.39*5.33 - 10.93*9.11","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"RAD : 01","label":"Radiant (0.01 - 0.99 ct)","category":"Fancy","sieve":"Radiant 1.38*1.15 - 6.37*5.31","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"AS : 02","label":"Asscher (1.00 - 4.99 ct)","category":"Fancy","sieve":"Asscher 5.77*5.77 - 9.86*9.86","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"AS : 01","label":"Asscher (0.01 - 0.99 ct)","category":"Fancy","sieve":"Asscher 1.24*1.24 - 5.75*5.75","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"TRI : 02","label":"Triangle (1.00 - 4.99 ct)","category":"Fancy","sieve":"Triangle 7.87*7.16 - 13.45*12.23","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"TRI : 01","label":"Triangle (0.01 - 0.99 ct)","category":"Fancy","sieve":"Triangle 1.70*1.54 - 7.85*7.13","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"TR : 02","label":"Trilliant (1.00 - 4.99 ct)","category":"Fancy","sieve":"Trilliant 7.14*6.93 - 12.20*11.85","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"TR : 01","label":"Trilliant (0.01 - 0.99 ct)","category":"Fancy","sieve":"Trilliant 1.54*1.49 - 7.12*6.91","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"TAP : 02","label":"Tapered Baguette (1.00 - 4.99 ct)","category":"Fancy","sieve":"Tapered Baguette 9.26*4.63 - 15.82*7.91","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"TAP : 01","label":"Tapered Baguette (0.01 - 0.99 ct)","category":"Fancy","sieve":"Tapered Baguette 1.99*1.00 - 9.23*4.61","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"BG : 02","label":"Baguette (1.00 - 4.99 ct)","category":"Fancy","sieve":"Baguette 8.55*4.77 - 14.61*7.30","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"BG : 01","label":"Baguette (0.01 - 0.99 ct)","category":"Fancy","sieve":"Baguette 1.84*0.92 - 8.52*4.26","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"PR : 02","label":"Princess (1.00 - 4.99 ct)","category":"Fancy","sieve":"Princess 5.61*5.61 - 9.58*9.58","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"PR : 01","label":"Princess (0.01 - 0.99 ct)","category":"Fancy","sieve":"Princess 1.21*1.21 - 5.59*5.59","pointers":"0.01 - 0.99","usd":130,"inr":11500},
  {"code":"EM : 02","label":"Emerald (1.00 - 4.99 ct)","category":"Fancy","sieve":"Emerald 6.71*4.79 - 11.46*8.19","pointers":"1.00 - 4.99","usd":130,"inr":13000},
  {"code":"EM : 01","label":"Emerald (0.01 - 0.99 ct)","category":"Fancy","sieve":"Emerald 1.44*1.03 - 6.68*4.77","pointers":"0.01 - 0.99","usd":130,"inr":11500},
];

const GEM: PriceEntry[] = [
  {"code":"MOTI : 01","label":"Moti","category":"Gem","sieve":"Moti","pointers":"","usd":5,"inr":300},
  {"code":"ME : 01","label":"Meena","category":"Gem","sieve":"Meena","pointers":"","usd":15,"inr":1000},
  {"code":"DA : 01","label":"Dak","category":"Gem","sieve":"Dak","pointers":"","usd":5,"inr":120},
  {"code":"CS : 01","label":"Color Stone","category":"Gem","sieve":"Color Stone","pointers":"","usd":11,"inr":500},
  {"code":"CS : 02","label":"Color Stone (large)","category":"Gem","sieve":"Color Stone (large)","pointers":"","usd":60,"inr":3000},
  {"code":"WP : 01","label":"Water Pearl","category":"Gem","sieve":"Water Pearl","pointers":"","usd":10,"inr":500},
  {"code":"TRIG : 01","label":"Triangle Gem Stone","category":"Gem","sieve":"Triangle Gem Stone","pointers":"","usd":15,"inr":1000},
];

const POLKI: PriceEntry[] = [
  {"code":"PO : 01","label":"Lab Polki +10-24","category":"Polki","sieve":"Lab Polki +10-24","pointers":"","usd":35,"inr":3000,"polki":true},
  {"code":"PO : 02","label":"Lab Polki +24-50","category":"Polki","sieve":"Lab Polki +24-50","pointers":"","usd":38,"inr":4000,"polki":true},
  {"code":"PO : 03","label":"Lab Polki +50-1.50","category":"Polki","sieve":"Lab Polki +50-1.50","pointers":"","usd":40,"inr":4500,"polki":true},
  {"code":"PO : 04","label":"Lab Polki 2 Ct.","category":"Polki","sieve":"Lab Polki 2 Ct.","pointers":"","usd":45,"inr":5000,"polki":true},
  {"code":"PO : 05","label":"Lab Polki 3 Ct.","category":"Polki","sieve":"Lab Polki 3 Ct.","pointers":"","usd":70,"inr":5500,"polki":true},
];

export const PRICE_LIST: PriceEntry[] = [...ROUND, ...FANCY, ...GEM, ...POLKI];
export const PRICE_CODES: string[] = PRICE_LIST.map((p) => p.code);

// Dropdown items: show "Code : Sieve/Size : Pointers" but the value is the code.
export const PRICE_OPTIONS: { value: string; label: string }[] = PRICE_LIST.map((p) => ({
  value: p.code,
  label: [p.code, p.sieve, p.pointers].filter(Boolean).join("  :  "),
}));

const BY_CODE: Record<string, PriceEntry> = Object.fromEntries(PRICE_LIST.map((p) => [p.code, p]));
export function findPrice(code: string): PriceEntry | undefined {
  return code ? BY_CODE[code.trim()] : undefined;
}
export function isPolkiCode(code: string): boolean {
  return !!findPrice(code)?.polki;
}

// --- Gold & Labour rates (per gram) ---------------------------------------
export const GOLD_RATES: Record<string, { usd: number; inr: number }> = {
  "14KT": { usd: 106, inr: 9798 },
  "18KT": { usd: 145, inr: 12488 },
};
export const LABOUR_RATES = {
  normal: { usd: 14, inr: 1199 },
  polki: { usd: 18, inr: 1499 },
};
export function karatFromGoldDetails(goldDetails: string): "14KT" | "18KT" | null {
  const s = (goldDetails || "").toLowerCase();
  if (s.includes("18")) return "18KT";
  if (s.includes("14")) return "14KT";
  return null;
}
