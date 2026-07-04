async (page) => {
  return "probe-ok: " + await page.title();
}