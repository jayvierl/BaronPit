"use client";

export function AgeField({ value, onChange, locked = false }: {value:string; onChange:(value:string)=>void; locked?:boolean}) {
  return <div className="field"><label htmlFor="age-band">Age group</label>
    <select id="age-band" required value={value} disabled={locked} onChange={event=>onChange(event.target.value)}>
      <option value="">Choose your age group</option><option value="child">Under 13</option>
      <option value="teen">13–17</option><option value="adult">18 or older</option>
    </select>
    {value === "child" && <span role="status" className="meta">You must be at least 13 to create an account.</span>}
  </div>;
}
export function TermsField({ checked, onChange }: {checked:boolean;onChange:(value:boolean)=>void}) {
  return <label style={{display:"flex",gap:8,alignItems:"baseline",margin:"14px 0"}}><input type="checkbox" required checked={checked}
    onChange={e=>onChange(e.target.checked)}/><span>I accept the <a href="/terms" target="_blank" rel="noreferrer">terms of use</a> and <a href="/guidelines" target="_blank" rel="noreferrer">community guidelines</a>.</span></label>;
}
