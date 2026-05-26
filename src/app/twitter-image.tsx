import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'ChatPort — Portable handoff docs for ChatGPT and Claude conversations';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#fafafa',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: '#111111',
              color: '#fafafa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '26px',
              fontWeight: 700,
            }}
          >
            C
          </div>
          <div style={{ fontSize: '28px', color: '#111111', fontWeight: 600 }}>
            ChatPort
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div
            style={{
              fontSize: '72px',
              fontWeight: 600,
              color: '#111111',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
            }}
          >
            Portable handoff docs
            <br />
            for long AI conversations.
          </div>
          <div style={{ fontSize: '28px', color: '#525252', lineHeight: 1.4 }}>
            Compress ChatGPT and Claude chats into structured markdown.
            <br />
            No LLMs. No accounts. Runs in your browser.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            fontSize: '20px',
            color: '#737373',
            fontFamily: 'monospace',
          }}
        >
          chatport.vercel.app
        </div>
      </div>
    ),
    { ...size }
  );
}
