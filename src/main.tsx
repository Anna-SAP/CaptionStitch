import { render } from 'preact';
import { App } from './app';
import { lang, setLang } from './i18n';
import { restoreSession } from './state';
import './styles.css';

setLang(lang.value);
render(<App />, document.getElementById('app')!);
void restoreSession();
