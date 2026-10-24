import type { BillingInterval, PlanCode } from '@estatery/shared';

/** Returned by POST admin/billing/checkout (and by a plan change that needs a fresh checkout). */
export interface CheckoutSession {
  mode: 'live' | 'test';
  keyId: string | null;
  subscriptionId: string;
  plan: PlanCode;
  interval: BillingInterval;
  amount: number;
  firstChargeAt: string | null;
  name: string;
  description: string;
  prefill: { name: string; email: string };
}

export interface CheckoutSuccess {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', cb: (r: { error?: { description?: string } }) => void): void;
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
let loading: Promise<void> | null = null;

/** Loads Razorpay Checkout once, on demand (only owners opening checkout ever download it). */
function loadScript() {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error('Razorpay Checkout couldn’t be loaded. Check your connection and try again.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Opens Razorpay's hosted checkout for a subscription. Card/UPI details never touch our servers. */
export async function openRazorpayCheckout(
  session: CheckoutSession,
  cb: { onSuccess: (r: CheckoutSuccess) => void; onFailure: (message: string) => void; onDismiss: () => void; color: string },
) {
  await loadScript();
  if (!window.Razorpay || !session.keyId) throw new Error('Razorpay Checkout isn’t available.');
  const rzp = new window.Razorpay({
    key: session.keyId,
    subscription_id: session.subscriptionId,
    name: session.name,
    description: session.description,
    prefill: session.prefill,
    theme: { color: cb.color },
    handler: (r: CheckoutSuccess) => cb.onSuccess(r),
    modal: { ondismiss: cb.onDismiss, confirm_close: true },
  });
  rzp.on('payment.failed', (r) => cb.onFailure(r.error?.description ?? 'The payment didn’t go through.'));
  rzp.open();
}
