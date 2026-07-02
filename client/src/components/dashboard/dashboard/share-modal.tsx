import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Check, Link, Calendar, Loader2 } from 'lucide-react';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  reportData: any;
}

export function ShareModal({ open, onClose, reportData }: ShareModalProps) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateShare() {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportData }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create share link');
      }
      
      const data = await response.json();
      setShareUrl(data.shareUrl);
      setExpiresAt(data.expiresAt);
    } catch (err) {
      setError('Failed to create share link. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function formatExpiryDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function handleClose() {
    setShareUrl(null);
    setExpiresAt(null);
    setError(null);
    setCopied(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="w-5 h-5 text-brand-blue" />
            Share Dashboard
          </DialogTitle>
          <DialogDescription>
            Create a shareable link to this dashboard. Links expire after 30 days.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!shareUrl ? (
            <Button 
              onClick={handleCreateShare}
              disabled={loading}
              className="w-full"
              data-testid="button-create-share"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating link...
                </>
              ) : (
                'Create Share Link'
              )}
            </Button>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Input
                  value={shareUrl}
                  readOnly
                  className="flex-1 bg-slate-50"
                  data-testid="input-share-url"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleCopy}
                  className="shrink-0"
                  data-testid="button-copy-link"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
              
              {copied && (
                <p className="text-sm text-emerald-600 font-medium" data-testid="text-copied">
                  Link copied to clipboard!
                </p>
              )}
              
              {expiresAt && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Calendar className="w-4 h-4" />
                  <span>
                    Expires: {formatExpiryDate(expiresAt)}
                  </span>
                </div>
              )}
            </>
          )}
          
          {error && (
            <p className="text-sm text-red-600" data-testid="text-error">{error}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
