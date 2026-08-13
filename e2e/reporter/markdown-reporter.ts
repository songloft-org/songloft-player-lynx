import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Reporter, File, TaskResultPack } from 'vitest'

const REPORT_DIR = path.resolve('e2e/reports')
const SCREENSHOT_DIR = path.resolve('e2e/screenshots')

interface TestEntry {
  suite: string
  name: string
  status: 'pass' | 'fail' | 'skip'
  duration: number
  error?: string
  screenshots: string[]
}

/**
 * Custom Vitest reporter that outputs a human-readable Markdown report
 * with embedded screenshot references for each test step.
 *
 * Output: `e2e/reports/report-<timestamp>.md`
 */
export default class MarkdownReporter implements Reporter {
  private entries: TestEntry[] = []
  private startTime = 0
  private platform = ''

  onInit(): void {
    this.startTime = Date.now()
    this.platform = process.env.E2E_PLATFORM ?? 'unknown'
    mkdirSync(REPORT_DIR, { recursive: true })
    mkdirSync(SCREENSHOT_DIR, { recursive: true })
  }

  onTaskUpdate(packs: TaskResultPack[]): void {
    for (const [id, result, meta] of packs) {
      // We only process individual test results, not suites
      if (!result?.state || result.state === 'run') continue
    }
  }

  onFinished(files?: File[]): void {
    if (!files) return

    for (const file of files) {
      this.collectTests(file.tasks, '')
    }

    const report = this.generateReport()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const reportPath = path.join(REPORT_DIR, `report-${timestamp}.md`)
    writeFileSync(reportPath, report, 'utf8')

    // Also write a `latest.md` symlink-like copy for easy access
    writeFileSync(path.join(REPORT_DIR, 'latest.md'), report, 'utf8')

    console.log(`\n📋 Test report: ${reportPath}`)
  }

  private collectTests(tasks: any[], parentSuite: string): void {
    for (const task of tasks) {
      if (task.type === 'suite' && task.tasks) {
        const suiteName = parentSuite
          ? `${parentSuite} > ${task.name}`
          : task.name
        this.collectTests(task.tasks, suiteName)
      } else if (task.type === 'test') {
        const status: 'pass' | 'fail' | 'skip' =
          task.result?.state === 'pass' ? 'pass' :
          task.result?.state === 'fail' ? 'fail' : 'skip'

        const screenshots = this.findScreenshots(task.name)

        this.entries.push({
          suite: parentSuite,
          name: task.name,
          status,
          duration: task.result?.duration ?? 0,
          error: task.result?.errors?.[0]?.message,
          screenshots,
        })
      }
    }
  }

  private findScreenshots(_testName: string): string[] {
    return []
  }

  private findAllScreenshots(): string[] {
    try {
      const files: string[] = readdirSync(SCREENSHOT_DIR)
      return files
        .filter((f: string) => f.endsWith('.png'))
        .sort()
        .map((f: string) => path.relative(REPORT_DIR, path.join(SCREENSHOT_DIR, f)))
    } catch {
      return []
    }
  }

  private generateReport(): string {
    const totalDuration = Date.now() - this.startTime
    const passed = this.entries.filter((e) => e.status === 'pass').length
    const failed = this.entries.filter((e) => e.status === 'fail').length
    const skipped = this.entries.filter((e) => e.status === 'skip').length
    const total = this.entries.length

    const lines: string[] = []

    // Header
    lines.push('# E2E 行为测试报告')
    lines.push('')
    lines.push(`| 项目 | 值 |`)
    lines.push(`|------|------|`)
    lines.push(`| 平台 | ${this.platform} |`)
    lines.push(`| 执行时间 | ${new Date().toLocaleString('zh-CN')} |`)
    lines.push(`| 总耗时 | ${(totalDuration / 1000).toFixed(1)}s |`)
    lines.push(`| 通过 | ${passed}/${total} |`)
    lines.push(`| 失败 | ${failed} |`)
    lines.push(`| 跳过 | ${skipped} |`)
    lines.push(`| 通过率 | ${total > 0 ? ((passed / total) * 100).toFixed(1) : 0}% |`)
    lines.push('')

    // Summary badge
    if (failed === 0) {
      lines.push('> ✅ **全部通过**')
    } else {
      lines.push(`> ❌ **${failed} 个测试失败，需要关注**`)
    }
    lines.push('')

    // Group by suite
    const suites = new Map<string, TestEntry[]>()
    for (const entry of this.entries) {
      const key = entry.suite || '(ungrouped)'
      if (!suites.has(key)) suites.set(key, [])
      suites.get(key)!.push(entry)
    }

    lines.push('---')
    lines.push('')
    lines.push('## 测试详情')
    lines.push('')

    for (const [suiteName, tests] of suites) {
      const suitePass = tests.every((t) => t.status !== 'fail')
      const icon = suitePass ? '✅' : '❌'
      lines.push(`### ${icon} ${suiteName}`)
      lines.push('')
      lines.push('| 状态 | 测试用例 | 耗时 |')
      lines.push('|:----:|---------|-----:|')

      for (const t of tests) {
        const statusIcon =
          t.status === 'pass' ? '✅' :
          t.status === 'fail' ? '❌' : '⏭️'
        const duration = `${(t.duration / 1000).toFixed(2)}s`
        lines.push(`| ${statusIcon} | ${t.name} | ${duration} |`)
      }
      lines.push('')

      // Show errors for failed tests
      const failures = tests.filter((t) => t.status === 'fail')
      if (failures.length > 0) {
        lines.push('<details>')
        lines.push('<summary>❌ 失败详情</summary>')
        lines.push('')
        for (const f of failures) {
          lines.push(`**${f.name}**`)
          lines.push('```')
          lines.push(f.error ?? 'Unknown error')
          lines.push('```')
          lines.push('')
        }
        lines.push('</details>')
        lines.push('')
      }


    }

    // Footer — screenshots
    lines.push('---')
    lines.push('')
    lines.push('## 步骤截图')
    lines.push('')
    const allScreenshots = this.findAllScreenshots()
    if (allScreenshots.length > 0) {
      for (const s of allScreenshots) {
        const name = path.basename(s, '.png')
        lines.push(`### ${name}`)
        lines.push('')
        lines.push(`![${name}](${s})`)
        lines.push('')
      }
    } else {
      lines.push('_本次运行未生成截图_')
    }
    lines.push('')
    lines.push('---')
    lines.push(`_由 e2e/reporter/markdown-reporter.ts 自动生成_`)

    return lines.join('\n')
  }
}
