const puppeteer = require("puppeteer");
const _ = require("lodash");

const args = require("minimist")(process.argv.slice(2));

const url = args["url"];

console.log(`URL = ${url}`);

const objectToCsv = values => {
  const header = _.keys(_.values(values)[0]).join(";");
  const v = _.values(values).map(v => _.values(v).join(";"));

  console.log([header, ...v].join("\n"));
};

(async url => {
  const browser = await puppeteer.launch({
    args: ["--window-size=320,669"]
  });
  const page = await browser.newPage();

  await page.goto(url);

  console.log("page opened");

  page.on("console", msg => console.log(">>>>>>>>>>>>>>> RESULTS PAGE LOG:", msg.text()));

  await page.waitForSelector(".pick_result .car_card_revamp__title");

  let { mapCarDetail, links } = await page.evaluate(() => {
    const get = (entity, attr, defaultValue) => (entity && entity[attr]) || defaultValue;

    let mapCarDetail = {};
    document.querySelectorAll(".pick_result").forEach(c => {
      const DRIVY_ANNOUNCE_ID = c.querySelector("a").getAttribute("data-car-id");
      const CAR = get(c.querySelector(".car_card_revamp__title"), "innerText", "unknown");
      const NUMBER_OF_VOTES = get(c.querySelector(".car_card_revamp__meta span"), "innerText", 0);
      const PRICE_PER_DAY = get(c.querySelector(".car_card_revamp__pricing > div:first-child"), "innerText", 0);

      mapCarDetail[DRIVY_ANNOUNCE_ID] = {
        ...mapCarDetail[DRIVY_ANNOUNCE_ID],
        CAR,
        NUMBER_OF_VOTES,
        PRICE_PER_DAY
      };
    });

    console.log("finish fetching all meta info");

    const links = Array.from(document.querySelectorAll(".car_card_revamp")).map(v => v.getAttribute("href"));

    return { mapCarDetail, links };
  });

  console.log("========PARTIAL=======");

  objectToCsv(mapCarDetail);

  await Promise.all(
    links.map(async (link, idx) => {
      const waitTime = 5000 * Math.log((idx+1) * (1 + Math.random()) + 1);
      console.log(`${idx} will wait for ${waitTime} ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      console.log(`${idx} just finish to wait for ${waitTime} ms`);

      let res = {};

      try {
        const page = await browser.newPage();
        await page.goto("https://www.drivy.com" + link);

        //car page
        await page.waitForSelector("#js_car_id .car_info_header__attributes");

        page.on("console", msg => console.log("------------ SINGLE ARTICLE PAGE LOG:", msg.text()));

        res = await page.evaluate(async () => {
          const get = (entity, attr, defaultValue) => (entity && entity[attr]) || defaultValue;

          const DRIVY_ANNOUNCE_ID = document.querySelector("#js_car_id").getAttribute("data-car-id");
          const textYearToParse = get(document.querySelector(".car_info_header__attributes"), "innerText", "");
          const TOTAL_RENTALS = get(document.querySelector(".rentals_count .statistics_value"), "innerText", 0);
          const FUEL_TYPE = get(document.querySelector("div.car_technical_features > div:nth-child(1) > div.cobalt-mb-extraTight > p"), "innerText", "unknown");
          const CAR_KILOMETERS = get(document.querySelector("div.car_technical_features > div:nth-child(1) > div:nth-child(2) > p"), "innerText", "unknown");
          const CAR_TRANSMISSION_TYPE = get(document.querySelector("div.car_technical_features > div:nth-child(2) > div > p"), "innerText", "unknown");

          const CAR_YEAR = textYearToParse.split(" ")[3];
          const CAR_TOTAL_SEATS = textYearToParse.split(" ")[5];

          return {
            DRIVY_ANNOUNCE_ID,
            TOTAL_RENTALS,
            CAR_YEAR,
            CAR_TOTAL_SEATS,
            FUEL_TYPE,
            CAR_KILOMETERS,
            CAR_TRANSMISSION_TYPE
          };
        });
      } catch (error) {
        console.error(`${idx} FAILED !!!`, error);
      }

      mapCarDetail[res.DRIVY_ANNOUNCE_ID] = {
        DRIVY_ANNOUNCE_ID: res.DRIVY_ANNOUNCE_ID,
        ...mapCarDetail[res.DRIVY_ANNOUNCE_ID],
        ..._.omit(res, "DRIVY_ANNOUNCE_ID")
      };
    })
  );

  console.log("========FINAL=======");

  objectToCsv(mapCarDetail);

  await browser.close();
})(url);
