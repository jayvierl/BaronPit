"use client";
import { useState } from "react";
import { exampleTipSplit } from "@/lib/duo-gratuity";
import styles from "../app/lfg/thanks/preview.module.css";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (cents: number) => currency.format(cents / 100);

export function DuoTipPreview({ platformBps }: { platformBps: number }) {
  const [amount, setAmount] = useState("5");
  const split = exampleTipSplit(amount, platformBps);
  return <section className={`card ${styles.panel}`} aria-labelledby="preview-title">
    <h2 id="preview-title">Try a tip amount</h2>
    <p>This example uses a {platformBps / 100}% platform share. Processing fees and taxes are excluded.</p>
    <div className={styles.choices} role="group" aria-label="Example tip amounts">
      {[0, 3, 5, 10].map(dollars => (
        <button key={dollars} type="button" className={`kind-tab${split?.total === dollars * 100 ? " active" : ""}`}
          aria-pressed={split?.total === dollars * 100} onClick={() => setAmount(String(dollars))}>
          {dollars === 0 ? "Free thanks" : money(dollars * 100)}
        </button>
      ))}
    </div>
    <label className="field">Example amount in USD
      <input type="text" inputMode="decimal" autoComplete="off" maxLength={7} value={amount}
        aria-invalid={!split} aria-describedby="tip-range" onChange={event => setAmount(event.target.value)} />
    </label>
    <p id="tip-range" className="meta">Enter $0 to $100 with up to two decimal places.</p>
    <div aria-live="polite" aria-atomic="true">
      {split ? <dl className={styles.breakdown}>
        <div><dt>Example tip</dt><dd>{money(split.total)}</dd></div>
        <div><dt>Platform share ({platformBps / 100}%)</dt><dd>{money(split.platform)}</dd></div>
        <div><dt>Your duo’s share before fees</dt><dd>{money(split.partner)}</dd></div>
      </dl> : <p>Enter a valid amount to see the split.</p>}
    </div>
  </section>;
}
