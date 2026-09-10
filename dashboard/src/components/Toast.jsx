import { useApp } from '../state/AppContext.jsx';

export default function Toast(){
  const { toast } = useApp();
  return <div className={'toast' + (toast ? ' show' : '')}>{toast || ''}</div>;
}
