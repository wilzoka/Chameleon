const puppeteer = require('puppeteer-extra')
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha')
const recaptchaPlugin = RecaptchaPlugin({
    provider: { id: '2captcha', token: '92b832e39c966b33181ef8fa45ac062f' }
})
puppeteer.use(recaptchaPlugin);
puppeteer.launch({ headless: false, slowMo: 10 }).then(async browser => {
    const page = await browser.newPage()
    // await page.goto('https://dfe-portal.sefazvirtual.rs.gov.br/Dfe/ConsultaPublicaDfe')
    // await page.type('#ChaveAcessoDfe', '43190491156471002516652020000411671000411672');
    await page.goto('https://backoffice.airbitclub.com/en/login')
    
    await page.type('#user', 'wbach01');
    await page.type('#password', 'Eusouocara69');

    // That's it! 🎉
    // await page.solveRecaptchas()
    // await page.waitForNavigation();
    await page.click('button.btn-login');
    await page.waitForNavigation();
    let bodyHTML = await page.evaluate(() => document.body.innerHTML);
    
    console.log(bodyHTML);
    //   await page.screenshot({ path: 'response.png', fullPage: true })
    //   await browser.close()
});