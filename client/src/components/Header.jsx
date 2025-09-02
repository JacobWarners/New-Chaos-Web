import React from 'react';
import logo from '../assets/weka.svg';
import styles from './Header.module.css';

function Header() {
  return (
    <div className={styles.container}>
      <img src={logo} alt="Weka Logo" width="200px" />
      <span className={styles.subheader}>
        Chaos Lab
      </span>
    </div>
  );
}

export default Header;
