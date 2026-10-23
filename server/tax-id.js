export function validTaxId(value){
 if(typeof value!=='string')return false;const digits=value.replace(/\D/g,'');if(/^(\d)\1+$/.test(digits))return false;
 if(digits.length===11){for(let size=9;size<=10;size++){let sum=0;for(let i=0;i<size;i++)sum+=Number(digits[i])*(size+1-i);let check=(sum*10)%11;if(check===10)check=0;if(check!==Number(digits[size]))return false}return true}
 if(digits.length===14){for(let size=12;size<=13;size++){let sum=0,weight=size-7;for(let i=0;i<size;i++){sum+=Number(digits[i])*weight;if(--weight<2)weight=9}const remainder=sum%11;const check=remainder<2?0:11-remainder;if(check!==Number(digits[size]))return false}return true}return false;
}
