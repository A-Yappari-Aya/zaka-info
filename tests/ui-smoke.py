from pathlib import Path
import re,json,os,shutil,tempfile
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
artifacts=Path(tempfile.mkdtemp(prefix='meet-greet-ui-'))
html=(root/'meet-greet/index.html').read_text().replace('<script type="module" src="./app.mjs"></script>','')
core=(root/'meet-greet/core.mjs').read_text().replace('export ','')
demo=re.sub(r"^import .*?;\n",'',(root/'meet-greet/demo.mjs').read_text(),flags=re.M).replace('export ','')
app=re.sub(r"^import .*?;\n",'',(root/'meet-greet/app.mjs').read_text(),flags=re.M).replace("(await import('./demo.mjs')).createDemo()",'createDemo()')

def load(page,query='',status=200):
    page.set_content(html)
    page.evaluate("history.replaceState=()=>{}")
    page.evaluate("(status)=>{window.fetch=async()=>({ok:status===200,status,json:async()=>({schemaVersion:1,generatedAt:null,releases:[]})})}",status)
    script=core+'\n'+demo+'\n'+app.replace('new URLSearchParams(location.search)',f'new URLSearchParams({json.dumps(query)})')
    page.add_script_tag(type='module',content=script)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1100})
    errors=[]
    desktop=context.new_page();desktop.on('pageerror',lambda e:errors.append(str(e)))
    load(desktop)
    desktop.wait_for_function("document.getElementById('message').textContent.includes('未取得を完売0')")
    assert desktop.locator('#content').is_hidden()
    desktop=context.new_page();desktop.on('pageerror',lambda e:errors.append(str(e)))
    load(desktop,'demo=1&round=2')
    desktop.wait_for_selector('#grid table')
    assert desktop.locator('#demo-notice').is_visible()
    assert desktop.locator('#comparison').inner_text().count('+1')>=1
    desktop.locator('#grid button').first.click()
    assert desktop.locator('#detail').is_visible()
    desktop.get_by_role('button',name='閉じる',exact=True).click()
    desktop.select_option('#round','3')
    assert desktop.locator('#grid button.likely').count()>0
    desktop.uncheck('#predictions');assert desktop.locator('#grid button.likely').count()==0
    desktop.check('#predictions')
    desktop.locator('#member').fill('サンプルB');assert desktop.locator('#grid tbody tr').count()==1
    desktop.locator('#member').fill('')
    desktop.screenshot(path=str(artifacts/'desktop.png'),full_page=True)
    mobile=context.new_page();mobile.set_viewport_size({'width':390,'height':844});mobile.on('pageerror',lambda e:errors.append(str(e)))
    load(mobile,'demo=1&round=2');mobile.wait_for_selector('#grid table')
    assert mobile.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    assert mobile.locator('#grid').evaluate('(el)=>el.scrollWidth > el.clientWidth')
    mobile.screenshot(path=str(artifacts/'mobile.png'),full_page=True)
    mobile.select_option('#group','櫻坂46');assert '未登録' in mobile.locator('#grid').inner_text()
    bad=context.new_page();load(bad,status=500)
    bad.wait_for_function("document.getElementById('message').textContent.includes('完売状態は更新していません')")
    assert bad.locator('#content').is_hidden()
    assert not errors,errors
    print(json.dumps({'checks':'passed','desktop':'1440x1100','mobile':'390x844','page_errors':errors,'mode':'offline inline module rendering; imports/query/history/fetch stubbed; live navigation not tested'},ensure_ascii=False))
    browser.close()
