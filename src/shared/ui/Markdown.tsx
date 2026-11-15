import { useEffect, useState, type ReactNode } from '@lynx-js/react'
import { decodeHTML } from 'entities'
import { nameToEmoji } from 'gemoji'
import type { MarkedToken, Token, Tokens } from 'marked'

import { openURL } from '../../native/native-platform.js'
import { parseMarkdown } from './markdown-parser.js'
import './Markdown.css'

interface MarkdownProps {
  content: string
  className?: string
}

/** Resolve GitHub shortcodes only in prose; code and link destinations stay literal. */
function emojiText(text: string): string {
  return text.replace(/:([a-z0-9_+-]+):/g, (shortcode, name: string) =>
    Object.prototype.hasOwnProperty.call(nameToEmoji, name)
      ? nameToEmoji[name] ?? shortcode
      : shortcode,
  )
}

// Only web links are actionable in release notes; HTML is always literal text.
function linkURL(token: Tokens.Link): string | null {
  const href = token.autolink ? token.href : decodeHTML(token.href)
  return /^https?:\/\/[^\s/]+(?:[/?#][^\s]*)?$/i.test(href) ? href : null
}

function inline(tokens: readonly Token[], depth = 0): ReactNode {
  return tokens.map((value, index) => {
    const token = value as MarkedToken
    if (depth >= 24)
      return <text key={index}>{'text' in token ? token.text : token.raw}</text>
    switch (token.type) {
      case 'strong':
      case 'em':
      case 'del':
        return (
          <text key={index} className={`markdown__${token.type}`}>
            {inline(token.tokens, depth + 1)}
          </text>
        )
      case 'codespan':
        return (
          <text key={index} className='markdown__code'>
            {token.text}
          </text>
        )
      case 'link': {
        const href = linkURL(token)
        return href ? (
          <text
            key={index}
            className='markdown__link'
            bindtap={() => {
              'background only'
              openURL(href)
            }}
          >
            {token.autolink ? (
              <text>{token.text}</text>
            ) : (
              inline(token.tokens, depth + 1)
            )}
          </text>
        ) : (
          <text key={index}>{inline(token.tokens, depth + 1)}</text>
        )
      }
      case 'image':
        return <text key={index}>{inline(token.tokens, depth + 1)}</text>
      case 'br':
        return <text key={index}>{'\u2028'}</text>
      case 'text':
        return token.tokens ? (
          <text key={index}>{inline(token.tokens, depth + 1)}</text>
        ) : (
          <text key={index}>{emojiText(decodeHTML(token.raw).replace(/\n/g, ' '))}</text>
        )
      case 'escape':
      case 'html':
        return <text key={index}>{token.text}</text>
      default:
        return <text key={index}>{token.raw}</text>
    }
  })
}

function table(token: Tokens.Table): ReactNode {
  return (
    <scroll-view
      className='markdown__table-scroll'
      scroll-orientation='horizontal'
      enable-nested-scroll={true}
    >
      <view className='markdown__table'>
        {[token.header, ...token.rows].map((row, rowIndex) => (
          <view key={rowIndex} className='markdown__table-row'>
            {row.map((cell, columnIndex) => (
              <view
                key={columnIndex}
                className={`markdown__table-cell${rowIndex === 0 ? ' markdown__table-header' : ''}`}
              >
                <text
                  className={`markdown__text${rowIndex === 0 ? ' markdown__strong' : ''}`}
                  style={{ textAlign: token.align[columnIndex] ?? 'left' }}
                >
                  {inline(cell.tokens)}
                </text>
              </view>
            ))}
          </view>
        ))}
      </view>
    </scroll-view>
  )
}

function blocks(tokens: readonly Token[], depth = 0): ReactNode {
  return tokens.map((value, index) => {
    const token = value as MarkedToken
    if (depth >= 24)
      return (
        <text key={index} className='markdown__text'>
          {token.raw}
        </text>
      )
    switch (token.type) {
      case 'space':
      case 'def':
        return null
      case 'heading':
        return (
          <text
            key={index}
            className={`markdown__text markdown__heading markdown__heading--${token.depth}`}
          >
            {inline(token.tokens)}
          </text>
        )
      case 'paragraph':
      case 'text':
        return (
          <text key={index} className='markdown__text'>
            {token.tokens ? inline(token.tokens) : emojiText(decodeHTML(token.text))}
          </text>
        )
      case 'blockquote':
        return (
          <view key={index} className='markdown__quote'>
            {blocks(token.tokens, depth + 1)}
          </view>
        )
      case 'list':
        return (
          <view key={index} className='markdown__list'>
            {token.items.map((item, itemIndex) => (
              <view key={itemIndex} className='markdown__list-row'>
                <text className='markdown__text markdown__marker'>
                  {item.task
                    ? item.checked
                      ? '☑'
                      : '☐'
                    : token.ordered
                      ? `${Number(token.start) + itemIndex}.`
                      : '•'}
                </text>
                <view className='markdown__list-body'>
                  {blocks(item.tokens, depth + 1)}
                </view>
              </view>
            ))}
          </view>
        )
      case 'code':
        return (
          <view key={index} className='markdown__code-block'>
            {token.text.split('\n').map((line, lineIndex) => (
              <text key={lineIndex} className='markdown__text markdown__code'>
                {line.replace(/\t/g, '    ').replace(/ /g, '\u00a0') ||
                  '\u00a0'}
              </text>
            ))}
          </view>
        )
      case 'table':
        return (
          <view key={index} className='markdown__block'>
            {table(token)}
          </view>
        )
      case 'hr':
        return <view key={index} className='markdown__rule' />
      default:
        return (
          <text key={index} className='markdown__text'>
            {token.raw}
          </text>
        )
    }
  })
}

/** GFM rendered with built-in Lynx elements, without HTML or DOM APIs. */
export function Markdown({ content, className = '' }: MarkdownProps) {
  const [parsed, setParsed] = useState<{
    content: string
    tokens: Token[] | null
  } | null>(null)
  useEffect(() => {
    setParsed({ content, tokens: parseMarkdown(content) })
  }, [content])
  return (
    <view className={`markdown ${className}`}>
      {parsed?.content === content ? (
        parsed.tokens ? (
          blocks(parsed.tokens)
        ) : (
          <text className='markdown__text'>{content}</text>
        )
      ) : null}
    </view>
  )
}
