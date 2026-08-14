// Diamond sieve sizes, generated from the company's Stone Size Master
// (SIEVE SIZE_GATI.pdf). Round stones are picked by sieve Size Name + Size MM;
// fancy shapes are picked by per-piece Pointer weight with a free-typed MM.
//
// Regenerate rather than hand-edit if the master list changes.

export type RoundSieve = { name: string; mm: string; pointer: string; group: string };
export type FancySize = { mm: string; pointer: string };

export const ROUND_SIEVES: RoundSieve[] = [
 {
  "name": "+0000-000",
  "mm": "0.80MM",
  "pointer": "0.0030",
  "group": "-2"
 },
 {
  "name": "+000-00",
  "mm": "0.90MM",
  "pointer": "0.0040",
  "group": "-2"
 },
 {
  "name": "+00-0",
  "mm": "1.00MM",
  "pointer": "0.0050",
  "group": "-2"
 },
 {
  "name": "+0-1",
  "mm": "1.10MM",
  "pointer": "0.0060",
  "group": "-2"
 },
 {
  "name": "+1-1.5",
  "mm": "1.15MM",
  "pointer": "0.0070",
  "group": "-2"
 },
 {
  "name": "+1.5-2",
  "mm": "1.20MM",
  "pointer": "0.0080",
  "group": "-2"
 },
 {
  "name": "+2-2.5",
  "mm": "1.25MM",
  "pointer": "0.0090",
  "group": "+2-6.5"
 },
 {
  "name": "+2.5-3",
  "mm": "1.30MM",
  "pointer": "0.0100",
  "group": "+2-6.5"
 },
 {
  "name": "+3-3.5",
  "mm": "1.35MM",
  "pointer": "0.0110",
  "group": "+2-6.5"
 },
 {
  "name": "+3.5-4",
  "mm": "1.45MM",
  "pointer": "0.0130",
  "group": "+2-6.5"
 },
 {
  "name": "+4-4.5",
  "mm": "1.50MM",
  "pointer": "0.0140",
  "group": "+2-6.5"
 },
 {
  "name": "+4.5-5",
  "mm": "1.55MM",
  "pointer": "0.0150",
  "group": "+2-6.5"
 },
 {
  "name": "+5-5.5",
  "mm": "1.60MM",
  "pointer": "0.0170",
  "group": "+2-6.5"
 },
 {
  "name": "+5.5-6",
  "mm": "1.70MM",
  "pointer": "0.0200",
  "group": "+2-6.5"
 },
 {
  "name": "+6-6.5",
  "mm": "1.80MM",
  "pointer": "0.0230",
  "group": "+2-6.5"
 },
 {
  "name": "+6.5-7",
  "mm": "1.90MM",
  "pointer": "0.0250",
  "group": "+6.5-11"
 },
 {
  "name": "+7-7.5",
  "mm": "2.00MM",
  "pointer": "0.0300",
  "group": "+6.5-11"
 },
 {
  "name": "+7.5-8",
  "mm": "2.10MM",
  "pointer": "0.0350",
  "group": "+6.5-11"
 },
 {
  "name": "+8-8.5",
  "mm": "2.20MM",
  "pointer": "0.0370",
  "group": "+6.5-11"
 },
 {
  "name": "+8.5-9",
  "mm": "2.30MM",
  "pointer": "0.0400",
  "group": "+6.5-11"
 },
 {
  "name": "+9-9.5",
  "mm": "2.40MM",
  "pointer": "0.0450",
  "group": "+6.5-11"
 },
 {
  "name": "+9.5-10",
  "mm": "2.50MM",
  "pointer": "0.0500",
  "group": "+6.5-11"
 },
 {
  "name": "+10-10.5",
  "mm": "2.60MM",
  "pointer": "0.0550",
  "group": "+6.5-11"
 },
 {
  "name": "+10.5-11",
  "mm": "2.70MM",
  "pointer": "0.0600",
  "group": "+6.5-11"
 },
 {
  "name": "+11-11.5",
  "mm": "2.80MM",
  "pointer": "0.0700",
  "group": "+11-14"
 },
 {
  "name": "+11.5-12",
  "mm": "2.90MM",
  "pointer": "0.0800",
  "group": "+11-14"
 },
 {
  "name": "+12-12.5",
  "mm": "3.00MM",
  "pointer": "0.0900",
  "group": "+11-14"
 },
 {
  "name": "+12.5-13",
  "mm": "3.10MM",
  "pointer": "0.1000",
  "group": "+11-14"
 },
 {
  "name": "+13-13.5",
  "mm": "3.20MM",
  "pointer": "0.1100",
  "group": "+11-14"
 },
 {
  "name": "+13.5-14",
  "mm": "3.30MM",
  "pointer": "0.1200",
  "group": "+11-14"
 },
 {
  "name": "+14-14.5",
  "mm": "3.40MM",
  "pointer": "0.1400",
  "group": "+14-16"
 },
 {
  "name": "+14.5-15",
  "mm": "3.50MM",
  "pointer": "0.1500",
  "group": "+14-16"
 },
 {
  "name": "+15-15.5",
  "mm": "3.60MM",
  "pointer": "0.1600",
  "group": "+14-16"
 },
 {
  "name": "+15.5-16",
  "mm": "3.70MM",
  "pointer": "0.1700",
  "group": "+14-16"
 },
 {
  "name": "+16-16.5",
  "mm": "3.80MM",
  "pointer": "0.1800",
  "group": "+16-20"
 },
 {
  "name": "+16.5-17",
  "mm": "3.90MM",
  "pointer": "0.1900",
  "group": "+16-20"
 },
 {
  "name": "+17-17.5",
  "mm": "4.00MM",
  "pointer": "0.2000",
  "group": "+16-20"
 },
 {
  "name": "+17.5-18",
  "mm": "4.10MM",
  "pointer": "0.2100",
  "group": "+16-20"
 },
 {
  "name": "+18-18.5",
  "mm": "4.20MM",
  "pointer": "0.2200",
  "group": "+16-20"
 },
 {
  "name": "+18.5-19",
  "mm": "4.30MM",
  "pointer": "0.2300",
  "group": "+16-20"
 },
 {
  "name": "+19-19.5",
  "mm": "4.40MM",
  "pointer": "0.2400",
  "group": "+16-20"
 },
 {
  "name": "+19.5-20",
  "mm": "4.50MM",
  "pointer": "0.2500",
  "group": "+16-20"
 },
 {
  "name": "+20-20.5",
  "mm": "",
  "pointer": "0.3000",
  "group": "+16-20"
 }
];

// Larger round stones are ordered by carat band rather than sieve.
export type CaratBand = { name: string; label: string; pointer: string };
export const ROUND_CARAT_BANDS: CaratBand[] = [
 {
  "name": "1/3",
  "label": "30-35 PNT",
  "pointer": "0.0000"
 },
 {
  "name": "3/8",
  "label": "36-44 PNT",
  "pointer": "0.0000"
 },
 {
  "name": "1/2",
  "label": "45-58 PNT",
  "pointer": "0.0000"
 },
 {
  "name": "5/8",
  "label": "59-69 PNT",
  "pointer": "0.0000"
 },
 {
  "name": "3/4",
  "label": "70-80 PNT",
  "pointer": "0.0000"
 },
 {
  "name": "7/8",
  "label": "90-97 PNT",
  "pointer": "0.0000"
 },
 {
  "name": "1CTS",
  "label": "98 PNT - 1.10 cts",
  "pointer": "1.0000"
 },
 {
  "name": "1.10-1.45",
  "label": "1.10-1.45",
  "pointer": "0.0000"
 },
 {
  "name": "1.46-1.98",
  "label": "1.46-1.98",
  "pointer": "0.0000"
 },
 {
  "name": "1.99-2.45",
  "label": "1.99-2.45",
  "pointer": "0.0000"
 },
 {
  "name": "2.46-2.98",
  "label": "2.46-2.98",
  "pointer": "0.0000"
 },
 {
  "name": "+2.99",
  "label": "2.99 and above",
  "pointer": "0.0000"
 },
 {
  "name": "1.00",
  "label": "CERTY DIAMOND",
  "pointer": "0.0000"
 },
 {
  "name": "10 cts",
  "label": "10CTS",
  "pointer": "10.0000"
 },
 {
  "name": "4CTS",
  "label": "2.99 and above",
  "pointer": "0.0000"
 }
];

export const FANCY_SHAPES: { label: string; sizes: FancySize[] }[] = [
 { label: "Cushion", sizes: [{"mm":"4MM","pointer":"0.2500"},{"mm":"4.5MM","pointer":"0.3600"},{"mm":"5MM","pointer":"0.4600"},{"mm":"5.25MM","pointer":"0.5600"},{"mm":"5.5MM","pointer":"0.6600"},{"mm":"5.75MM","pointer":"0.7600"},{"mm":"6MM","pointer":"0.8400"},{"mm":"6.25MM","pointer":"0.9300"},{"mm":"6.5MM","pointer":"1.0300"},{"mm":"6.75MM","pointer":"1.2400"},{"mm":"7MM","pointer":"1.2800"},{"mm":"7.5MM","pointer":"1.6700"},{"mm":"8MM","pointer":"2.0400"},{"mm":"8.5MM","pointer":"2.4300"},{"mm":"9MM","pointer":"2.7500"},{"mm":"9.5MM","pointer":"3.3500"},{"mm":"10MM","pointer":"3.8700"},{"mm":"10.5MM","pointer":"4.4100"},{"mm":"11MM","pointer":"4.9100"},{"mm":"11.5MM","pointer":"5.8500"},{"mm":"12MM","pointer":"6.8400"},{"mm":"13MM","pointer":"8.5100"},{"mm":"14MM","pointer":"10.4900"},{"mm":"15MM","pointer":"12.8900"}] },
 { label: "Emerald", sizes: [{"mm":"2.8*3MM","pointer":"0.0800"},{"mm":"3*2MM","pointer":"0.1000"},{"mm":"3.5*2MM","pointer":"0.1200"},{"mm":"4*2MM","pointer":"0.1500"},{"mm":"4*2.80MM","pointer":"0.1800"},{"mm":"4*3MM","pointer":"0.2000"},{"mm":"4.5*3.5MM","pointer":"0.2500"},{"mm":"5*3MM","pointer":"0.2900"},{"mm":"4.5*5.00 MM EM","pointer":"0.3300"},{"mm":"4.75*3.5 MM EM","pointer":"0.3600"},{"mm":"5.2*3.6MM","pointer":"0.4000"},{"mm":"5.5*3.5MM","pointer":"0.4600"},{"mm":"5.5*4MM","pointer":"0.4800"},{"mm":"6*4MM","pointer":"0.6600"},{"mm":"6.5*4.5MM","pointer":"0.8800"},{"mm":"7*5MM","pointer":"1.0600"},{"mm":"7.25*5.25MM","pointer":"1.2400"},{"mm":"7.12*6.15MM","pointer":"1.3500"},{"mm":"7.5*5.5MM","pointer":"1.4500"},{"mm":"8*6MM","pointer":"1.7400"},{"mm":"8.5*6.5MM","pointer":"2.1700"},{"mm":"9*7MM","pointer":"2.6200"},{"mm":"10*7MM","pointer":"3.0100"},{"mm":"9.5*7.5MM","pointer":"3.6200"},{"mm":"10*8MM","pointer":"3.7900"},{"mm":"11*9MM","pointer":"5.2100"},{"mm":"12*8MM","pointer":"5.3400"},{"mm":"12*10MM","pointer":"6.0000"},{"mm":"14*8MM","pointer":"6.2500"},{"mm":"13*9MM","pointer":"6.3800"},{"mm":"14*10MM","pointer":"8.4800"},{"mm":"13*11MM","pointer":"9.1300"},{"mm":"14*12MM","pointer":"11.2600"},{"mm":"16*12MM","pointer":"14.2200"}] },
 { label: "Heart", sizes: [{"mm":"3.5MM","pointer":"0.1800"},{"mm":"4MM","pointer":"0.2500"},{"mm":"4.25MM","pointer":"0.2800"},{"mm":"4.5MM","pointer":"0.3400"},{"mm":"4.75MM","pointer":"0.3800"},{"mm":"5MM","pointer":"0.4400"},{"mm":"5.5MM","pointer":"0.6100"},{"mm":"6MM","pointer":"0.7400"},{"mm":"6.25MM","pointer":"0.8300"},{"mm":"6.5MM","pointer":"0.9300"},{"mm":"7MM","pointer":"1.1300"},{"mm":"7.5MM","pointer":"1.5900"},{"mm":"8MM","pointer":"1.7100"},{"mm":"9MM","pointer":"2.4100"},{"mm":"9.5MM","pointer":"2.9000"},{"mm":"10MM","pointer":"3.1600"},{"mm":"11MM","pointer":"4.4100"},{"mm":"12MM","pointer":"5.6600"},{"mm":"13MM","pointer":"7.8800"},{"mm":"14MM","pointer":"9.3800"},{"mm":"15MM","pointer":"10.7900"},{"mm":"16MM","pointer":"13.2700"},{"mm":"18MM","pointer":"15.3300"}] },
 { label: "Marquise", sizes: [{"mm":"3.5*1.75MM","pointer":"0.0650"},{"mm":"3.5*2MM","pointer":"0.0700"},{"mm":"4*2MM","pointer":"0.1000"},{"mm":"4.09*2.00 MM MQ","pointer":"0.1000"},{"mm":"3.75*1.75","pointer":"0.1100"},{"mm":"4.5*2.5MM","pointer":"0.1200"},{"mm":"4.25*2.25MM","pointer":"0.1400"},{"mm":"5*2.5MM","pointer":"0.1400"},{"mm":"5.5*2.75MM","pointer":"0.1600"},{"mm":"5.5*3MM","pointer":"0.1800"},{"mm":"5*3MM","pointer":"0.2000"},{"mm":"3*1.5MM","pointer":"0.2500"},{"mm":"6*3MM","pointer":"0.2500"},{"mm":"6.5*3MM","pointer":"0.2800"},{"mm":"7*3MM","pointer":"0.3000"},{"mm":"7.5*3.5MM","pointer":"0.3300"},{"mm":"7*3.5MM","pointer":"0.3500"},{"mm":"7*4MM","pointer":"0.4000"},{"mm":"8*4MM","pointer":"0.4700"},{"mm":"9*4.5MM","pointer":"0.7100"},{"mm":"9*5MM","pointer":"0.7600"},{"mm":"9.5*5MM","pointer":"0.8500"},{"mm":"10*5MM","pointer":"0.9500"},{"mm":"11*6.5MM","pointer":"1.2500"},{"mm":"11.5*6MM","pointer":"1.3300"},{"mm":"12*6MM","pointer":"1.6200"},{"mm":"12*6.5MM","pointer":"1.7100"},{"mm":"13*65MM","pointer":"2.1100"},{"mm":"14*7MM","pointer":"2.4800"},{"mm":"14*8MM","pointer":"3.0000"},{"mm":"15*7.5MM","pointer":"3.0900"},{"mm":"15*7MM","pointer":"3.1200"},{"mm":"15*8MM","pointer":"3.4400"},{"mm":"16*8MM","pointer":"3.8600"},{"mm":"17*8.5MM","pointer":"4.8800"},{"mm":"17.5*10MM","pointer":"5.5000"},{"mm":"20*8MM","pointer":"7.0800"},{"mm":"20*10MM","pointer":"7.9400"},{"mm":"20*11MM","pointer":"9.5000"}] },
 { label: "Oval", sizes: [{"mm":"5.20*3.80MM","pointer":"0.0100"},{"mm":"3.55*2.5MM","pointer":"0.0700"},{"mm":"3.7* 3.6MM","pointer":"0.1800"},{"mm":"4.20*3.00MM","pointer":"0.2000"},{"mm":"4.5*3.5MM","pointer":"0.2100"},{"mm":"5*3MM","pointer":"0.2100"},{"mm":"4.90*3.45MM","pointer":"0.2500"},{"mm":"5*4MM","pointer":"0.3200"},{"mm":"5.5*3.5MM","pointer":"0.3300"},{"mm":"6*4MM","pointer":"0.4300"},{"mm":"5.90*4.00MM","pointer":"0.4800"},{"mm":"6.00*4.00 MM OV","pointer":"0.5000"},{"mm":"6.5*5MM","pointer":"0.6100"},{"mm":"6.5*4.5MM","pointer":"0.6500"},{"mm":"6.80*4.90MM","pointer":"0.7000"},{"mm":"7*5MM","pointer":"0.7600"},{"mm":"7.5*5.5MM","pointer":"0.9800"},{"mm":"8*6MM","pointer":"1.2100"},{"mm":"9*6MM","pointer":"1.4100"},{"mm":"8.5*6.5MM","pointer":"1.4600"},{"mm":"9.80*6.50","pointer":"1.7300"},{"mm":"9*7MM","pointer":"1.8600"},{"mm":"9*7MM OV","pointer":"2.0000"},{"mm":"10*8MM","pointer":"2.5400"},{"mm":"10.5*8.5MM","pointer":"2.8800"},{"mm":"11*9MM","pointer":"3.8500"},{"mm":"12*8MM","pointer":"4.9900"},{"mm":"12*10MM","pointer":"5.0500"},{"mm":"14*10MM","pointer":"5.8100"},{"mm":"13*11MM","pointer":"6.0500"},{"mm":"14*12MM","pointer":"8.2100"},{"mm":"15*12MM","pointer":"8.7600"},{"mm":"16*12MM","pointer":"9.3200"},{"mm":"18*12","pointer":"10.0000"},{"mm":"10CT OV","pointer":"10.0500"},{"mm":"18*13MM","pointer":"12.8600"},{"mm":"20*15MM","pointer":"14.9600"}] },
 { label: "Pear", sizes: [{"mm":"2*3MM","pointer":"0.0300"},{"mm":"2.00*3.00","pointer":"0.0500"},{"mm":"3.5*2.5MM PE","pointer":"0.0700"},{"mm":"3*2MM","pointer":"0.1300"},{"mm":"4*2.5MM","pointer":"0.1800"},{"mm":"4*3MM","pointer":"0.2100"},{"mm":"5*3MM","pointer":"0.2500"},{"mm":"5.5*3.3MM","pointer":"0.3000"},{"mm":"5*4MM","pointer":"0.3500"},{"mm":"6*4MM","pointer":"0.3900"},{"mm":"6*3.7MM","pointer":"0.5000"},{"mm":"7.00*4.2MM PE","pointer":"0.5000"},{"mm":"6.5*4.5MM","pointer":"0.5700"},{"mm":"7*5MM","pointer":"0.7100"},{"mm":"8*5MM","pointer":"0.8100"},{"mm":"7.7x5.7 MM PE","pointer":"1.0600"},{"mm":"8.5*5.5MM","pointer":"1.0800"},{"mm":"8*6MM","pointer":"1.2500"},{"mm":"9*6MM","pointer":"1.3300"},{"mm":"9.30*5.78MM","pointer":"1.5000"},{"mm":"9.7*6.3MM","pointer":"1.5900"},{"mm":"10*6MM","pointer":"1.7100"},{"mm":"9*7MM","pointer":"1.7500"},{"mm":"10*7MM","pointer":"1.8000"},{"mm":"10*8MM","pointer":"2.4600"},{"mm":"11*7.5MM","pointer":"2.6100"},{"mm":"13*8MM","pointer":"2.9800"},{"mm":"11*8MM","pointer":"3.0000"},{"mm":"12*8MM","pointer":"3.0000"},{"mm":"12*7MM","pointer":"3.1200"},{"mm":"12*9MM","pointer":"3.4400"},{"mm":"14*8MM","pointer":"3.4700"},{"mm":"13*9MM","pointer":"4.1100"},{"mm":"14*9MM","pointer":"4.2500"},{"mm":"15*9MM","pointer":"5.0600"},{"mm":"14*10MM","pointer":"5.4100"},{"mm":"13*11MM","pointer":"5.6500"},{"mm":"15*10MM","pointer":"5.7500"},{"mm":"16*9MM","pointer":"5.8600"},{"mm":"16*10MM","pointer":"6.2700"},{"mm":"17*10MM","pointer":"6.4600"},{"mm":"15*11MM","pointer":"7.3600"},{"mm":"18*11MM","pointer":"8.1400"},{"mm":"16*12MM","pointer":"8.9900"},{"mm":"18*12MM","pointer":"9.3500"},{"mm":"18*13MM","pointer":"10.2100"}] },
 { label: "Princess", sizes: [{"mm":"1.5MM","pointer":"0.0150"},{"mm":"1.75MM","pointer":"0.0350"},{"mm":"2MM","pointer":"0.0600"},{"mm":"2MM","pointer":"0.0800"},{"mm":"2.5MM","pointer":"0.1000"},{"mm":"2.75MM","pointer":"0.1300"},{"mm":"3MM","pointer":"0.1800"},{"mm":"3.25MM","pointer":"0.2600"},{"mm":"3.5MM","pointer":"0.2900"},{"mm":"3.75MM","pointer":"0.3100"},{"mm":"4MM","pointer":"0.3900"},{"mm":"4.25MM","pointer":"0.4400"},{"mm":"4.5MM","pointer":"0.5600"},{"mm":"4.75MM","pointer":"0.6400"},{"mm":"5MM","pointer":"0.7100"},{"mm":"5.25MM","pointer":"0.7500"},{"mm":"5.5MM","pointer":"0.9900"},{"mm":"5.75MM","pointer":"1.1100"},{"mm":"6MM","pointer":"1.2400"},{"mm":"6.25MM","pointer":"1.3900"},{"mm":"6.5MM","pointer":"1.5900"},{"mm":"6.75MM","pointer":"1.7500"},{"mm":"7MM","pointer":"1.9600"},{"mm":"7.25MM","pointer":"2.0100"},{"mm":"7.5MM","pointer":"2.4000"},{"mm":"7.75MM","pointer":"2.7400"},{"mm":"8MM","pointer":"3.0100"},{"mm":"8.25MM","pointer":"3.2400"},{"mm":"8.5MM","pointer":"3.6700"},{"mm":"8.75MM","pointer":"4.1000"},{"mm":"9MM","pointer":"4.1200"},{"mm":"9.5MM","pointer":"4.1200"},{"mm":"9.75MM","pointer":"5.3600"},{"mm":"10MM","pointer":"5.6200"},{"mm":"10.25MM","pointer":"5.7600"},{"mm":"10.5MM","pointer":"5.9900"},{"mm":"11MM","pointer":"7.4400"},{"mm":"11.5MM","pointer":"9.4400"},{"mm":"12MM","pointer":"9.5200"}] },
 { label: "Radiant", sizes: [{"mm":"2.1*2.2MM RAD","pointer":"0.0600"},{"mm":"2.90*3 MM RAD","pointer":"0.1300"},{"mm":"5*3MM","pointer":"0.3100"},{"mm":"4.5*3.5MM","pointer":"0.3400"},{"mm":"6*3MM","pointer":"0.4100"},{"mm":"6*4MM","pointer":"0.6000"},{"mm":"6.5*45MM","pointer":"0.8300"},{"mm":"7*5MM","pointer":"1.1400"},{"mm":"7.25*5.25MM","pointer":"1.2400"},{"mm":"7.5*5.5MM","pointer":"1.4700"},{"mm":"8*6MM","pointer":"1.7400"},{"mm":"8.5*6.5MM","pointer":"2.2500"},{"mm":"9*7MM","pointer":"2.6200"},{"mm":"9.5*7.5MM","pointer":"3.1800"},{"mm":"10*7MM","pointer":"3.3100"},{"mm":"10*8MM","pointer":"3.4900"},{"mm":"11*9MM","pointer":"5.0500"},{"mm":"12*9MM","pointer":"6.0600"},{"mm":"11.5*10MM","pointer":"6.4500"},{"mm":"13*9MM","pointer":"6.5400"},{"mm":"12*10MM","pointer":"6.7900"},{"mm":"14*10MM","pointer":"8.4700"},{"mm":"13*11MM","pointer":"9.3300"},{"mm":"13.5*11.5MM","pointer":"10.1900"},{"mm":"15*11MM","pointer":"11.4800"},{"mm":"14*12MM","pointer":"12.1400"},{"mm":"16*12MM","pointer":"14.2200"}] },
 { label: "Straight Baguette", sizes: [{"mm":"2*1MM","pointer":"0.0200"},{"mm":"2*1.5MM","pointer":"0.0400"},{"mm":"2*1.75MM","pointer":"0.0400"},{"mm":"2.25*2MM","pointer":"0.0450"},{"mm":"2.5*1MM","pointer":"0.0450"},{"mm":"2.5*1.25MM","pointer":"0.0470"},{"mm":"2.5*1.5MM","pointer":"0.0500"},{"mm":"3*1MM","pointer":"0.0500"},{"mm":"2.5*1.75MM","pointer":"0.0550"},{"mm":"2.5*2MM","pointer":"0.0550"},{"mm":"2.75*1.5MM","pointer":"0.0550"},{"mm":"3*1.25MM","pointer":"0.0550"},{"mm":"2.75*1.75MM","pointer":"0.0600"},{"mm":"2.75*2MM","pointer":"0.0600"},{"mm":"3*1.5MM","pointer":"0.0600"},{"mm":"3.25*1.25MM","pointer":"0.0600"},{"mm":"2.75*2.5MM","pointer":"0.0650"},{"mm":"3.25*1.5MM","pointer":"0.0650"},{"mm":"3.5*1MM","pointer":"0.0650"},{"mm":"3.5*1.25MM","pointer":"0.0700"},{"mm":"3.5*1.5MM","pointer":"0.0700"},{"mm":"4*1.25MM","pointer":"0.0750"},{"mm":"3*1.75MM","pointer":"0.0800"},{"mm":"3.25*1.75MM","pointer":"0.0800"},{"mm":"3.5*1.75MM","pointer":"0.0800"},{"mm":"4*1.5MM","pointer":"0.0800"},{"mm":"3*2MM","pointer":"0.1000"},{"mm":"4.5*1.5MM","pointer":"0.1000"},{"mm":"4*1.75MM","pointer":"0.1100"},{"mm":"3*2.5MM","pointer":"0.1300"},{"mm":"3.5*2MM","pointer":"0.1300"},{"mm":"3.25*2.5MM","pointer":"0.1400"},{"mm":"3.75*1.5MM","pointer":"0.1400"},{"mm":"4*2MM","pointer":"0.1400"},{"mm":"4.5*1.75MM","pointer":"0.1400"},{"mm":"5*1.5MM","pointer":"0.1400"},{"mm":"3.75*2MM","pointer":"0.1450"},{"mm":"3.5*2.5MM","pointer":"0.1500"},{"mm":"3.5*3MM","pointer":"0.1500"},{"mm":"5*1.75MM","pointer":"0.1500"},{"mm":"5.5*1.75MM","pointer":"0.1600"},{"mm":"4.5*2MM","pointer":"0.1700"},{"mm":"5.5*2MM","pointer":"0.1800"},{"mm":"5*2MM","pointer":"0.1900"},{"mm":"4*3MM","pointer":"0.2000"},{"mm":"4.5*2.5MM","pointer":"0.2000"},{"mm":"5.5*2.5MM","pointer":"0.2300"},{"mm":"5*2.5MM","pointer":"0.2400"},{"mm":"4.75*2MM","pointer":"0.2700"},{"mm":"4.75*1.5MM","pointer":"0.2800"},{"mm":"6*1.75MM","pointer":"0.2800"},{"mm":"4.5*3MM","pointer":"0.2850"},{"mm":"4.5*3.5MM","pointer":"0.3000"},{"mm":"5*3MM","pointer":"0.3000"},{"mm":"5.5*3MM","pointer":"0.3000"},{"mm":"6*2MM","pointer":"0.3000"},{"mm":"5*3.5MM","pointer":"0.3300"},{"mm":"5.5*3.5MM","pointer":"0.3300"},{"mm":"6*2.5MM","pointer":"0.3300"},{"mm":"2.25*1.75MM","pointer":"0.4000"},{"mm":"5*4MM","pointer":"0.4000"},{"mm":"6*3MM","pointer":"0.4000"}] },
 { label: "Trillion", sizes: [{"mm":"3MM","pointer":"0.1200"},{"mm":"3.5MM","pointer":"0.1600"},{"mm":"3.75MM","pointer":"0.1900"},{"mm":"4MM","pointer":"0.2300"},{"mm":"4.25MM","pointer":"0.2700"},{"mm":"4.5MM","pointer":"0.3100"},{"mm":"4.75MM","pointer":"0.3700"},{"mm":"5MM","pointer":"0.4200"},{"mm":"5.25MM","pointer":"0.4900"},{"mm":"5.5MM","pointer":"0.5500"},{"mm":"5.75MM","pointer":"0.6400"},{"mm":"6MM","pointer":"0.7000"},{"mm":"6.25MM","pointer":"0.7500"},{"mm":"6.5MM","pointer":"0.9100"},{"mm":"6.75MM","pointer":"0.9800"},{"mm":"7.5MM","pointer":"1.2100"},{"mm":"7MM","pointer":"1.5000"},{"mm":"8MM","pointer":"1.7500"},{"mm":"9MM","pointer":"2.3500"},{"mm":"11MM","pointer":"3.6600"},{"mm":"12MM","pointer":"4.9000"},{"mm":"13MM","pointer":"6.4200"},{"mm":"15MM","pointer":"9.0000"}] }
];

export const FANCY_LABELS = FANCY_SHAPES.map((s) => s.label);

export function fancySizesFor(shape: string): FancySize[] {
  const hit = FANCY_SHAPES.find((s) => s.label.toLowerCase() === shape.trim().toLowerCase());
  return hit ? hit.sizes : [];
}

export function isRoundShape(shape: string): boolean {
  return shape.trim().toLowerCase() === "round";
}

// "0.1600" -> "0.16"; keeps whole numbers readable too.
export function trimPointer(p: string): string {
  const n = parseFloat(p);
  if (!isFinite(n)) return p;
  return String(parseFloat(n.toFixed(4)));
}
