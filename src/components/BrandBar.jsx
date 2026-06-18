import cseLogo from '../assets/CSE-logo-new.png'
import tcSymbol from '../assets/TC_Symbol_RedBlue.png'

export default function BrandBar() {
  return (
    <div className="brand-bar">
      <img src={cseLogo} alt="CSE" className="brand-bar-logo" />
      <div className="tc-mark-badge">
        <img src={tcSymbol} alt="Triple Crown Sports" className="tc-mark" />
      </div>
    </div>
  )
}
