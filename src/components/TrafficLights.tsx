import { invoke } from '@tauri-apps/api/core';
import styles from './TrafficLights.module.css';

export default function TrafficLights() {
  return (
    <div className={styles.lights}>
      <button 
        className={`${styles.light} ${styles.close}`}
        onClick={() => invoke('close_window')}
      >
        <svg viewBox="-1.7 -0.9 20 20" className={styles.icon}>
          <path d="M13.3008 0.590912L0.556664 13.3448C-0.185523 14.0772-0.195289 15.4737 0.585961 16.2647C1.37698 17.046 2.79299 17.0167 3.51565 16.294L16.2598 3.5499C17.0313 2.77841 17.0215 1.43076 16.2207 0.629974C15.4199-0.170807 14.0821-0.180573 13.3008 0.590912ZM16.2598 13.3253L3.51565 0.581146C2.78323-0.14151 1.38674-0.180573 0.585961 0.620209C-0.205055 1.42099-0.175758 2.80771 0.556664 3.54013L13.3008 16.2843C14.0723 17.0558 15.4199 17.046 16.2207 16.255C17.0215 15.4542 17.0313 14.1065 16.2598 13.3253Z" fill="var(--tl-close-icon)"/>
        </svg>
      </button>
      <button 
        className={`${styles.light} ${styles.minimize}`}
        onClick={() => invoke('minimize_window')}
      >
        <svg viewBox="-1 -9 20 20" className={styles.icon}>
          <path d="M2.04102 4.18945L15.2734 4.18945C16.3574 4.18945 17.3145 3.23242 17.3145 2.09961C17.3145 0.966797 16.3574 0.0195312 15.2734 0.0195312L2.04102 0.0195312C1.01562 0.0195312 0 0.966797 0 2.09961C0 3.23242 1.01562 4.18945 2.04102 4.18945Z" fill="var(--tl-minimize-icon)"/>
        </svg>
      </button>
      <button 
        className={`${styles.light} ${styles.maximize}`}
        onClick={() => invoke('toggle_maximize_window')}
      >
        <svg viewBox="0 -1 20 20" className={styles.icon}>
          <path d="M15.5371 0.0195312L3.82812 0.0195312C1.41602 0.0195312 0 1.42578 0 3.84766L0 15.5566C0 16.0449 0.0683594 16.5039 0.185547 16.9043L16.8945 0.195312C16.4844 0.078125 16.0352 0.0195312 15.5371 0.0195312ZM2.4707 19.1992C2.88086 19.3164 3.33008 19.3848 3.82812 19.3848L15.5371 19.3848C17.9492 19.3848 19.3652 17.9688 19.3652 15.5566L19.3652 3.84766C19.3652 3.34961 19.2969 2.89062 19.1797 2.49023Z" fill="var(--tl-maximize-icon)"/>
        </svg>
      </button>
    </div>
  );
}
