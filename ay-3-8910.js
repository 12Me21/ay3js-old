delete console; //console.log is too unsafe

Oscillator=function(){
	this.period=0;
	this.state=false;
	this.counter=0;
}
Oscillator.prototype.step=function(){
	if(++this.counter>=this.period){
		this.counter=0;
		this.nextState();
	}
}

ToneOscillator=function(){
	Oscillator.call(this);
}
ToneOscillator.prototype = Object.create(Oscillator.prototype);
ToneOscillator.prototype.nextState=function(){
	this.state=!this.state;
}

NoiseOscillator=function(){
	Oscillator.call(this);
}
NoiseOscillator.prototype = Object.create(Oscillator.prototype);
NoiseOscillator.prototype.nextState=function(){
	this.state=Math.random()<0.5;
}

EnvelopeOscillator=function(){
	Oscillator.call(this);
	this.state=0;
	this.mode=0;
}
EnvelopeOscillator.prototype = Object.create(Oscillator.prototype);
EnvelopeOscillator.patterns=(function(){
	var patterns=new Array(16);
	for(var env=0;env<16;env++){
		patterns[env]=new Array(128);
		var hold=0;
		var dir=(env&4)? 1:-1;
		var vol=(env&4)?-1:32;
		for(var pos=0;pos<128;pos++){
			if(!hold){
				vol+=dir;
				if(vol<0 || vol>=32){
					if(env&8){
						if(env&2)
							dir=-dir;
						vol=(dir>0)?0:31;
						if(env&1){
							hold=1;
							vol=(dir>0)?31:0;
						}
					}else{
						vol=0;
						hold=1;
					}
				}
			}
			patterns[env][pos] = (vol>>1);
		}
	}
	return patterns;
})();
EnvelopeOscillator.prototype.nextState=function(){
	if(++this.state>=128)
		this.state-=64;
}
EnvelopeOscillator.prototype.volume=function(){
	return EnvelopeOscillator.patterns[this.mode][this.state];
}

Channel=function(){
	this.tone=false;
	this.noise=false;
	this.volume=0;
	this.envelope=false;
}

AY=function(onInterrupt,clock){
	this.clock=(clock || 1.79*1000*1000)/16*2;
	this.channel={
		[0]: new Channel(),
		[1]: new Channel(),
		[2]: new Channel(),
	};
	this.oscillator={
		[0]: new ToneOscillator(),
		[1]: new ToneOscillator(),
		[2]: new ToneOscillator(),
		noise: new NoiseOscillator(),
		envelope: new EnvelopeOscillator(),
	};
	this.counter=0;
	this.onInterrupt=onInterrupt;
}
AY.volumes=[0, 836, 1212, 1773, 2619, 3875, 5397, 8823, 10392, 16706, 23339, 29292, 36969, 46421, 55195, 65535];
AY.prototype.cycle=function(steps){
	var output=[0,0,0];
	
	for(var j=0;j<steps;j++){
		for(var i=0;i<3;i++){
			this.oscillator[i].step();
		}
		this.oscillator.noise.step();
		this.oscillator.envelope.step();
		if(this.onInterrupt)
			if(++this.counter>this.clock/50){
				var result=this.onInterrupt(this);
				if(!result)
					return false;
				this.counter=0;
			}
		
		for(var i=0;i<3;i++){
			var level;
			if(this.channel[i].tone && this.oscillator[i].state  ||  this.channel[i].noise && this.oscillator.noise.state){
				level=0;
			}else{
				if(this.channel[i].envelope){
					level=this.oscillator.envelope.volume();
				}else{
					level=this.channel[i].volume;
				}
			}
			output[i]+=AY.volumes[level]/steps;
		}
	}
	return output;
}

AY.prototype.setRegister=function(register,value){
	switch(register){
	case 0:case 2:case 4:
		this.oscillator[register>>1].period = this.oscillator[register>>1].period&0xFF00 | value&0xFF
	break;case 1:case 3:case 5:
		this.oscillator[register-1>>1].period = this.oscillator[register-1>>1].period&0x00FF | (value&0x0F)<<8
	break;case 6:
		this.oscillator.noise.period = (value & 0b11111)*2
	break;case 7:
		for(var i=0;i<3;i++){
			this.channel[i].tone = !(value & 0b000001<<i)
			this.channel[i].noise= !(value & 0b001000<<i)
		}
	break;case 8:case 9:case 10:
		this.channel[register-8].volume = value & 0b1111;
		this.channel[register-8].envelope = value & 0b10000;
	break;case 11:
		this.oscillator.envelope.period = this.oscillator.envelope.period&0xFF00 | value&0xFF
	break;case 12:
		this.oscillator.envelope.period = this.oscillator.envelope.period&0x00FF | (value&0xFF)<<8
	break;case 13:
		this.oscillator.envelope.mode = value & 0xF;
	}
}

var psgFile; //Uint8Array
var psgIndex; //Number

//psg: Uint8Array
function loadPSG(psg){
	if(window.sound){
		window.sound.onaudioprocess=undefined;
		window.sound.disconnect;
	}
	
	psgFile=new Uint8Array(psg);
	psgIndex=17;
	
	window.ay=new AY(interrupt);
	
	// ay.setRegister(7,0b111000)
	// ay.setRegister(0,200)
	// ay.setRegister(1,210)
	// ay.setRegister(2,220)
	// ay.setRegister(8,15)
	// ay.setRegister(9,15)
	// ay.setRegister(10,15)
	
	window.audioContext=new AudioContext();
	var bufferSize = 4096;
	
	window.sound = audioContext.createScriptProcessor(bufferSize, 2, 2);
	sound.onaudioprocess = function(e) {
		var left = e.outputBuffer.getChannelData(0);
		var right = e.outputBuffer.getChannelData(1);
		for (var i = 0; i < bufferSize; i++) {
			var x=ay.cycle(5);
			if(!x)
				sound.disconnect();
			left[i] = (x[0]+x[1]*.6+x[2]*.4)/2/65535;
			right[i] = (x[0]*.4+x[1]*.6+x[2])/2/65535;
		}
	}
	sound.connect(audioContext.destination);
}

function eated_file_go(){
	var reader=new FileReader();
	reader.onload=function(x){
		loadPSG(reader.result);
	};
	reader.readAsArrayBuffer(this.files[0]);
}

function interrupt(ay){
	
	while(1){
		if(psgIndex>=psgFile.length)
			return false;
		var reg=psgFile[psgIndex++];
		if(reg<=0xF){
			ay.setRegister(reg,psgFile[psgIndex++]);
		}else if(reg==0xFD){
			return false;
		}else if(reg==0xFE){
			//???
		}else if(reg==0xFF){
			return true;
		}else{
			return false;
		}
	}
}