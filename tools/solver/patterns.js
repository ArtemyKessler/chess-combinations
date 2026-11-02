// Pattern rows: first string = farthest from own side. '.' = any, 'o' = must be empty, '*' = any non-king own piece.
module.exports = {
  falanga: {name:'Фаланга', rows:['PPPP']},
  stena:   {name:'Стена', rows:['PPPPPP']},
  tsep:    {name:'Цепь', rows:['...P','..P.','.P..','P...']},
  zastava: {name:'Застава', rows:['.N.','P.P']},
  bastion: {name:'Бастион', rows:['.N.','PRP']},
  pushka:  {name:'Пушка Алехина', rows:['R','R','Q']},
  brigada: {name:'Лёгкая бригада', rows:['NN','BB']},
  polk:    {name:'Полк', rows:['NN','BB','RR']},
  parad:   {name:'Парад', rows:['RNBQ']},
  kare:    {name:'Каре', rows:['***','*o*','***']},
};
