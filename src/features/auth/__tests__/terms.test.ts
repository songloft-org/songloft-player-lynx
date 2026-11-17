import { expect, test } from 'vitest'

import { getTermsContent } from '../legal/terms.js'

test('Chinese locales receive the complete Chinese agreement', () => {
  for (const locale of ['zh', 'zh-CN', 'zh_TW', 'ZH-Hans']) {
    const content = getTermsContent(locale)
    expect(content).toContain('# 用户协议与隐私政策')
    expect(content).toContain('## 3. 隐私政策')
    expect(content).toContain('## 7. 联系方式')
    expect(content.match(/Apache-2\.0/g)).toHaveLength(2)
    expect(content).not.toContain('GPL-3.0')
  }
})

test('other locales fall back to the complete English agreement', () => {
  for (const locale of ['en', 'en-US', 'es', '']) {
    const content = getTermsContent(locale)
    expect(content).toContain('# Terms of Service & Privacy Policy')
    expect(content).toContain('## 3. Privacy Policy')
    expect(content).toContain('## 7. Contact')
    expect(content.match(/Apache-2\.0/g)).toHaveLength(2)
    expect(content).not.toContain('GPL-3.0')
  }
})
