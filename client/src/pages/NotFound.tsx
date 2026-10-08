import { Link } from 'wouter';
import { LandingMark } from '@/components/LandingMark';

export default function NotFound() {
  return (
    <div className="sk-auth sk-notfound">
      <span className="sk-plus sk-plus-tl" aria-hidden="true" />
      <span className="sk-plus sk-plus-tr" aria-hidden="true" />

      <p className="sk-label sk-notfound-kicker">Error <i>&middot;</i> Page not found</p>
      <h1 className="sk-notfound-code" aria-label="404">
        <span>4</span><span className="sk-notfound-zero">0</span><span>4</span>
      </h1>
      <div className="sk-notfound-art" aria-hidden="true">
        <LandingMark className="sk-notfound-mark" />
        <i className="d1" /><i className="d2" /><i className="d3" />
      </div>
      <h2 className="sk-notfound-title">This page wandered off.</h2>
      <p className="sk-notfound-copy">The link may be old, or the page was moved. Let us take you back.</p>
      <div className="sk-notfound-actions">
        <Link href="/" className="sk-btn sk-btn-dark">Back home</Link>
        <Link href="/chat" className="sk-btn sk-btn-light">Open chat</Link>
      </div>
    </div>
  );
}
