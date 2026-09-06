import React, { useState, useEffect } from 'react';
import { p2pSync, SyncStatus } from '../p2pSync';

interface P2PSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPerformFullSync: () => void;
}

export const P2PSyncModal: React.FC<P2PSyncModalProps> = ({
  isOpen,
  onClose,
  onPerformFullSync
}) => {
  const [activeTab, setActiveTab] = useState<'connect' | 'tutorial'>('connect');
  const [peerId, setPeerId] = useState<string>('');
  const [targetCode, setTargetCode] = useState<string>('');
  const [status, setStatus] = useState<SyncStatus>('disconnected');
  const [connectedCount, setConnectedCount] = useState<number>(0);
  const [copied, setCopied] = useState<boolean>(false);
  const [connecting, setConnecting] = useState<boolean>(false);

  useEffect(() => {
    const unsub = p2pSync.onStatusChange((newStatus, id, count) => {
      setStatus(newStatus);
      setPeerId(id);
      setConnectedCount(count);
      if (newStatus === 'connected') {
        setConnecting(false);
      }
    });
    return () => unsub();
  }, []);

  if (!isOpen) return null;

  const handleCopyCode = () => {
    if (!peerId) return;
    navigator.clipboard.writeText(peerId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = targetCode.trim();
    if (!raw) return;
    setConnecting(true);
    const success = await p2pSync.connectToPeer(raw);
    setConnecting(false);
    if (success) {
      onPerformFullSync();
    } else {
      alert('خطا در اتصال به دستگاه مقصد. مطمئن شوید برنامه روی هر دو دستگاه باز است و کد دقیق وارد شده است.');
    }
  };

  return (
    <div className="auth-backdrop" onClick={onClose}>
      <div className="auth-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
        <div className="auth-header">
          <h2>⚡ همگام‌سازی زنده و آنی (P2P)</h2>
          <button type="button" className="auth-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Modal Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', borderBottom: '1px solid var(--line-soft)', paddingBottom: '8px' }}>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'connect' ? 'active' : ''}`}
            onClick={() => setActiveTab('connect')}
            style={{ flex: 1, padding: '6px' }}
          >
            🔗 اتصال دستگاه‌ها
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'tutorial' ? 'active' : ''}`}
            onClick={() => setActiveTab('tutorial')}
            style={{ flex: 1, padding: '6px' }}
          >
            📖 آموزش استفاده
          </button>
        </div>

        {activeTab === 'connect' ? (
          <div>
            {/* Status indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: status === 'connected' ? '#e8f5e9' : '#fbf5e8',
              border: `1.5px solid ${status === 'connected' ? '#4caf50' : 'var(--line)'}`,
              borderRadius: '10px',
              padding: '8px 12px',
              marginBottom: '14px',
              fontSize: '0.85rem',
              fontWeight: 700
            }}>
              <span>
                {status === 'connected'
                  ? `🟢 متصل به ${connectedCount} دستگاه (همگام‌سازی زنده فعال است)`
                  : status === 'connecting'
                  ? '🟡 در حال اتصال...'
                  : '⚪ دستگاه‌ها متصل نیستند'}
              </span>
              {status === 'connected' && (
                <button
                  type="button"
                  onClick={onPerformFullSync}
                  style={{
                    background: '#2e854b',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '0.75rem',
                    cursor: 'pointer'
                  }}
                >
                  ارسال اطلاعات فعلی
                </button>
              )}
            </div>

            {/* My Device Code */}
            <div className="auth-field" style={{ marginBottom: '14px' }}>
              <label>کد اختصاصی این دستگاه (برای اتصال):</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  dir="ltr"
                  readOnly
                  value={peerId || 'در حال دریافت کد...'}
                  style={{
                    fontWeight: 800,
                    background: '#f9f5eb',
                    letterSpacing: '1px',
                    textAlign: 'center',
                    fontSize: '0.95rem',
                    color: 'var(--primary)'
                  }}
                />
                <button
                  type="button"
                  onClick={handleCopyCode}
                  style={{
                    background: copied ? '#2e854b' : 'var(--primary)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0 12px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {copied ? 'کپی شد ✓' : 'کپی کد'}
                </button>
              </div>
            </div>

            {/* Connect to Remote Device Form */}
            <form onSubmit={handleConnect} className="auth-form">
              <div className="auth-field">
                <label>کد دستگاه دیگر را وارد کنید:</label>
                <input
                  type="text"
                  dir="ltr"
                  placeholder="کد دستگاه مقصد را اینجا پیست کنید..."
                  value={targetCode}
                  onChange={(e) => setTargetCode(e.target.value)}
                  style={{
                    textAlign: 'center',
                    letterSpacing: '1px',
                    fontSize: '0.95rem',
                    fontWeight: 700
                  }}
                  required
                />
              </div>

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={connecting || !targetCode.trim()}
              >
                {connecting ? 'در حال برقراری اتصال زنده...' : '⚡ اتصال و همگام‌سازی فوری'}
              </button>
            </form>
          </div>
        ) : (
          /* Tutorial Section */
          <div style={{ fontSize: '0.85rem', lineHeight: '1.7', color: 'var(--ink)' }}>
            <h4 style={{ margin: '0 0 8px', color: 'var(--primary)' }}>راهنمای همگام‌سازی بین گوشی و کامپیوتر:</h4>
            <ol style={{ paddingRight: '20px', margin: 0 }}>
              <li>برنامه را روی هر دو دستگاه (گوشی و لپ‌تاپ) باز کنید.</li>
              <li>روی یکی از دستگاه‌ها دکمه <b>«⚡ اتصال زنده»</b> را باز کنید و <b>کد اختصاصی</b> را کپی کنید.</li>
              <li>در دستگاه دیگر، کد کپی‌شده را در کادر <b>«کد دستگاه دیگر»</b> پیست کرده و روی <b>«اتصال»</b> بزنید.</li>
              <li>به محض اتصال (سبز شدن وضعیت)، تمام برگه‌ها، ساعت‌ها، تست‌ها و روتین‌ها به‌صورت زنده و آنی همگام می‌شوند!</li>
            </ol>
            <div style={{
              marginTop: '12px',
              padding: '8px 10px',
              background: '#e8f4fd',
              borderRadius: '8px',
              fontSize: '0.8rem',
              color: '#1a5276'
            }}>
              💡 <b>نکته مهم:</b> این قابلیت از فناوری مستقیم مرورگر (WebRTC) استفاده می‌کند و کاملاً بدون سرور، امن، بدون فیلتر و فوق‌العاده پرسرعت است.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
