import { eosEqSolver } from './src/core/main';

const r=[0.034,0.931,-0.1];
const a=1;
const b=-(r[0]+r[1]+r[2]);
const c=r[0]*r[1]+r[0]*r[2]+r[1]*r[2];
const d=-(r[0]*r[1]*r[2]);
console.log('coeff', [a,b,c,d]);
for (const m of ['root','ls','newton','fsolve','qr'] as const){
  const res=eosEqSolver(b,c,d,{solver_method:m,guessNo:120,bounds:[-2,3,0.5],maxIter:250,ftol:1e-10,xtol:1e-10});
  console.log(m,res.roots,res.solver_method);
}
