const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export class DrivingSimulation {
  constructor() { this.reset(); }
  reset() {
    Object.assign(this, {x:0,z:0,heading:0,speed:8.333333,steer:0,
      roll:0,rollVelocity:0,pitch:0,pitchVelocity:0,heave:0,
      acceleration:0,yawRate:0,distance:0,pedalUsed:false});
  }
  spring(value, velocity, target, dt, frequency=9) {
    velocity += ((target-value)*frequency*frequency-1.8*frequency*velocity)*dt;
    return [value+velocity*dt,velocity];
  }
  step(dt, input={}, enabled=true) {
    dt=clamp(dt,0,1/30);
    if (enabled) {
      if (input.accelerate || input.brake) this.pedalUsed=true;
      const previousSpeed=this.speed;
      const acceleration=input.brake ? -15 : input.accelerate ? 6.2*(1-this.speed/55) : this.pedalUsed ? -.18-.0009*this.speed*this.speed : 0;
      this.speed=clamp(this.speed+acceleration*dt,0,44.4444);
      this.acceleration=(this.speed-previousSpeed)/Math.max(dt,1e-8);
      const steeringLimit=Math.min(25*Math.PI/180,Math.atan(8.5*2.964/(this.speed*this.speed+1)));
      const target=((input.right?1:0)-(input.left?1:0))*steeringLimit;
      this.steer+=(target-this.steer)*(1-Math.exp(-6.5*dt));
      this.yawRate=this.speed/2.964*Math.tan(this.steer);
      this.heading+=this.yawRate*dt;
      this.x+=Math.cos(this.heading)*this.speed*dt;
      this.z-=Math.sin(this.heading)*this.speed*dt;
      this.distance+=this.speed*dt;
    } else {
      this.yawRate=0;this.acceleration=0;
    }
    const targetRoll=enabled ? clamp(Math.atan(this.speed*this.yawRate/9.81)*.14,-.075,.075) : 0;
    const targetPitch=enabled ? clamp(this.acceleration*.003,-.035,.025) : 0;
    [this.roll,this.rollVelocity]=this.spring(this.roll,this.rollVelocity,targetRoll,dt,9);
    [this.pitch,this.pitchVelocity]=this.spring(this.pitch,this.pitchVelocity,targetPitch,dt,10);
    const targetHeave=enabled ? -Math.min(.016,Math.abs(this.speed*this.yawRate)*.0015) : 0;
    this.heave+=(targetHeave-this.heave)*(1-Math.exp(-7*dt));
    return this;
  }
}
