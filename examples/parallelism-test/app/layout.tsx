export const metadata = {
  title: "Parallelism Test",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <style>{`
          :root {
            color-scheme: light dark;
            --text: #111;
            --text-muted: #666;
            --text-dim: #999;
            --bg: #fff;
            --pass-bg: #f0fdf4;
            --pass-text: #166534;
            --pass-border: #bbf7d0;
            --fail-bg: #fef2f2;
            --fail-text: #991b1b;
            --fail-border: #fecaca;
            --btn-disabled: #999;
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --text: #eee;
              --text-muted: #999;
              --text-dim: #666;
              --bg: #111;
              --pass-bg: #052e16;
              --pass-text: #86efac;
              --pass-border: #14532d;
              --fail-bg: #450a0a;
              --fail-text: #fca5a5;
              --fail-border: #7f1d1d;
              --btn-disabled: #555;
            }
          }
          body { background: var(--bg); color: var(--text); margin: 0; }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
