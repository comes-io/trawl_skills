const page = await browser.newPage();
await page.goto('data:text/html,<h1 data-testid="t">hello</h1>');
const title = await page.$eval('[data-testid="t"]', (el) => el.textContent);
returnData([{ title }]);
