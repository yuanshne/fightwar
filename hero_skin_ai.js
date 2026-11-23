/* hero_skin_ai.js — 骑士 19 套非默认皮肤基于 32×38 AI 主角帧的程序化染色/取帧层
 * 入口约定：window.PQ_HERO_SKIN_AI = { ready:boolean, frames(skinId) -> 帧对象|null }
 *   · frames('blue') 恒返回 null：blue 现状视觉由 ai_sprites.js / hero_anim.js / ai_style.js
 *     既有链路负责，本模块不重绘 blue，保证不退化。
 *   · 其余 19 套：从 AI 底帧（hero_small 待机 + hero_anim 跑/攻帧）按调色板分区
 *     （描边 / 盔甲三阶 / 围巾饰件三阶 / 白色五官手套）程序化染色，全部 32×38。
 *   · 本文件未加载、未就绪或任一底帧解码失败 → frames() 返回 null，art.js 回退原逻辑，不白屏。
 * 加载顺序：必须在 ai_sprites.js / hero_anim.js 之后（Boss 线负责挂 <script> 标签）。
 * 守卫：AI 底帧就绪后，对 SPR.skins[id] 安装不可写/不可删描述符，并外包 getHeroSkin；
 *   另挂常驻看门狗，发现顶层 hero* 帧回流到 16×16 或缺帧时按 AI 源帧复位（后加载兜底）。
 * 不改碰撞框 / 移动速度 / 攻击判定 / 技能时序，只改视觉与取帧管线。
 *
 * 源帧以内嵌 data URI 形式打包（EMBED）：file:// 协议下 file URL 图片会污染 canvas，
 * getImageData 被浏览器拦截；data URI 同源不污染，可逐像素分区染色。
 * 若后续重切 AI 源帧，重跑 tools/_v54_embed_assets.py 重新生成本文件 EMBED 段即可。
 */
(function () {
  'use strict';
  if (window.PQ_HERO_SKIN_AI && window.PQ_HERO_SKIN_AI.__stub !== true) return;

  var FW = 32, FH = 38; // 固定 32×38（与 AI 底帧一致）

  /* __EMBED_BEGIN__ 由 tools/_v54_embed_assets.py 生成：{ idle:[uri], run:[uri×4], atk:[uri×3] } */
  var EMBED = {"idle":["data:image/png;base64,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"],"run":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAmCAYAAAClI5npAAALK0lEQVR4nK1YeVhU5R5+v7PMYWaYYRkUBsQNZRARBEvAzMSFzNQyNCVTsMUnq6fM8slbVtpyvS1mt2v6ZJoVafemGa65L4lZauACLhiCI8swMPs+Z8757h8IhUsXn+7vr/Occ77vfd/f9v3OIbgto6AgSDJkV/hFMjgnSwWv3U0PlVnfGNQn2eF12mxVDcdKbmdHcnsEgOyM4bObg+LnQbfTOPLOGEV1vSJOYlTw+H0IY2TwVKykAeHj8nP7PuvKfsz1N+69Z3ahXp+68+UfKADg7KdnMXPMAowa9Sz0+qx8o93xKgcWCZT9escR0WwPMNCq1cEYTWQoIqZ7qFUmaS0B6+qUfiPf6gqBDg9QSpGemrUkGCLdfCGJ+PyOIXF6w5es1xEjeyWbj3EL+u6xWWZOMd1VU1MxhY3O2sgG5aCgJrJMqFatJIzkx0tjcsVP9x9ha+rNlW7H5YwueYBSiuys0c+mDU7Ze/FS+dPG2tNzz5QfG+pzOns12VpGt/A0c+zBne8LCtT5m1t/zUgyvPhR43F4PV4M1ABZMTwaG+uhDwtCIYSzbr+fUaqVP9+WB25lp2WK8f0z10pWtykqQmmP75Z6ft/x/2yfMWNu3pZde/fNyk6GwPNk26lKsvTl6fKuo2dw8ZL1yvY92/tGRkaCkD+HuOFpdsZ9s6+aaxeAQlCqw/eG3PyhCK0cTB8wQomQ0NjUdLG719OsM3pdCwOsoge8LbhDy5B/LHgCGUU5FM2tZN03laWP/W3xZEpp1wlQSpGWMqzU6XM/oFCEgVAKmcqATMHwLBjRCaeX+iSWP63kuJyQ24+EyACNS44lKWx/FOkVMpmc67d7PL/dNe2FjK6AdxBY8fgKLNu35oJCrTVIoghJDACQZYZhZBBAohRBUSRhqnCWY1gEzCbqmpiLxLsGkCxTNajIyLZKK9m6+fhbFE1vUAp0ARsAwFAAH/+44SSviTY47Va7x2k/6/N67AzLMRSEkwnDMQzLKdUalgmK1GNulplR6UR49WlSP6sQ+xs1MO09Q4IKJ9X2i5sz/9H5w7oKDgBMcsqdZWFa7RC7o0UkwcDxAfH61VT2X/G4nfC5HbLPaYfX7Qx5TPUBl+QljgVzGGvPJCiMzYj+Zjd4QwIOrV1GjnZLl9PyNXEVvorC9pB2iYAkKDVmiyUUcjpaGhZ9f+/+FftX3D9p9GADrydTtP3YCQMTicmUwrsHZZ1yv7mQuseNl30+SXLWtVDxl0r4+xsQ0EYh/ZWJ6MNE0/oWtq6L2AAA7rVROSve2bx3tRlMOOaldSqLwxQAAQrHJa+uHPtI9tkEgwS7g1UzCvjqmiG22BFWeRZ8zzi4uqsxtuhuElh8KpkQoKskmKM1pkCPxF5v6aL7r3r9tc69g4KCUooz9piHH7rwnaT75ZCsvFyHIXzEe5ESOUofLUDgwHFZW21EpSec+7LXAHnITOlxenVXHkC6FAZis1FERgKEtC1oL52OayFzG+66Y0J/zoi7Y3nsahA2NB74boZhxuyvmmY9MjO473BIlZHCxQxLQ+a5LVJ64wn2p2/YX3YcLM1px/+zcuSion4HbG8LbWVE8M+Xnl/TrHBMOFx5KdAUSjh9oeyqbYNYPGMk3QSpv8EshQtg/V4EjtrQL8KF7P2l7PItqaI+pTV73esTniRkx/88EblOagFgwB5kT3Nh+fKKh3Rs7eOZvSNhr2VAjlXtn1pb8crINkkwdh+awPzQhDC1hgRd5RAaqvD+SQFNPhWvZ4J4c2vzqrVL3ok6U/fjcCf6rft83Sffg7YFFu1SCfk95xwVn9y/9J2vVxj9nt4mr4xwdSSS43tsLq86j2E5KeYdtn/PLV9DAFAQAI+NNhy0sDEjq80a6fwVF6MRnOThB1lf6fbQLotblb/l4wK15XgDFhnLECmGXTx39lgKGm6SA5QCz69aWVBz4IuNfQX1lxd/0xxOzR1U/9FHi/YBys5vXwtTVlL+U815yavSdHapn/ECG07UtMpkRbPDLR4vrxVAJ2PTB1nnv60+0XuXpg4p3dLDskflwmw0oknrPzgmc+D26iVbytd/suMQAYCpk8Z9K3KWe0s3n4i4Ae+PLgPBQyRm/JHFT38tPlYQ4bS5CO92ktjaBty9e5N8OiKesXtIlXKdKe0SdiI5P+NCkl7rLyzeuNga/GVQg7Y+qbm+rsjPh9CkUuJI/t8JBwAZBv7X+kZ+bHvZtOcDIR34AAgMJHZ02fxHNtNH7xNgd9AIEEJidLiqjILuaAmjio6n1nkPDxzb6zXrtqxXJxkmvp3y3jObhs/KiysDUHpto+LJy0pyYvuZJ/wuDMDEO2e+mJUReWXJmn9t+oP8jlNljjpx1NZFT34rF9yrQ0CUqBhiQWX42DDkHdyOnod2w6vrgZhuouRsDbJHyizO3OGIWLu24oZ+8Mey5NqxCClZhrD8eZTSjgzdA2Dp3AWLTa2N+h/6xs+m08fxjNUv05DEQsEiqFQgYc8xTKsvw5u1kaipYBCtYNkWUSepIhK0pmPm5hnjni0ghJRdn0v0GpEbOkQ71/Q3Fx+0aJTD2TvSOCkyApJMAX+IMjxPJLUCnlYX4o5W4CXHfmzYaccRY7QcHqeDTBgmTEEgg8qE5RnO2+S6v8/AGV9sf3fb9VidQtDRC6IWPsU/p3ibmzZRJ6vUkNw+SQhTUJUYYjmGklCjCVE1RtxVfxIDG6uw+1QI+2xqSaXhWTS4QBgKwglgNHqwglLkFTzPNF860VR3aGibvM6aOzWiUUMnL+Piz86PFpXQrPlVol6wXATPGploWJlwqJUc+ppqYGi+got+BZaeUcDCqUKqD5/gomtry4V5r5S1xN/xHJV8MiFgGCoDlFBJlvmbqW8jcK3tJi+Zs66nYC3O9mikKovAVmv6MZLKJQUqqlh/oxHD+gTBK3hcsqixtSURFhoNjvdCO6YHl6BP2jCi6JVj3ydkT2UiekuE48HyjEwIx8vWy7I+Mma12djJ4Z098MzCjUWV0pZi2WjHS6fDWSZWGZKUHBfKGsEGawlgOo2TlliA4aGM1kGl4qhGkqiK9XgLhqS+Xj16mmN9VK+PQrxaoww4wat7giUSGHvtlbHhlqJ1p/YdvpUHCAAUTs2vGpgop9pM4Vt/21D6QBGAo8CowyPvy6tqsM9jgt3UYVE6wrIAZBkghNKAi/RUNFl7RHe/tOuSO5uLTgB1NwPmant4t74OQcHWGPN2jyYr21P75icilznhwVc9YkOqtn/enEUfvvdZRxkCB0DIgZzk1KGX+ah8X1ASlQLPUJnKjKDgZZvj3IvjR2wtt7gWbjl3Lqi0nHMP7d3ruU/zL6/vvfJym7rzN+T6DcYEauoeqrggzH9u7jVwQjqaT+74t4a1stp8gbTKkqueJzzDsqowHl5TyOtSvlw4//kyQQhCUMi8wuvdtufIpvV9VlIQSkHQxZlQBc03Vy+ULe90JFMKSgiMdT99UM/1ka3hSYxOFTTKphNbmZbzOzLiFcWelm3biV6/I0av+3lkVn9itsJPO3XPro7GtyAa32vsV7r0aTRySLEYYxhnf2PCG52X0bZxzV5TgxeeKgxMGjfCVVJS0uVp+JZms9mQmFWwMSptKtUOLgp2G/ggnXzPE1Ouod502sxLzMPOkpKcW6r5E7vOT23ZmpQ+8aSLj86UvDYmkXW9e6ry4MJbZXJXP8FuZdf9oGjbaFau4YrDYiUOixOnKg/uvCnX9hV/AfwGAu3xayINYt6dKjIkMwLFhfd8Xl//F+PaVQLtaoaHLZ2eonNfyR0QdAZE2mvKlCNjrlH8vxP4L1w/Nws/XZfGAAAAAElFTkSuQmCC","data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAmCAYAAAClI5npAAAKeklEQVR4nLWXe3RNVx7Hv799zn3f3NzkyvshJIgkBEVQ6h1VlEYbM0UfZtKXZ1dbRUtrWl1TlunSsZbHaHUGbT1GFp3VlmAoogkaFaQkIc+byPPe677vOWfPHwTxjFkzv7XOWuecvc/en/39/X77/DbhEWzw4KyZ1ubaL0EacXJvA+xOd8PxEnl1mEmvNHlc3tLS42sfZTwAoI52zMysQcmVLBsJoqlTwHk20mxIK3Mqgik0DHqNGiJjaLU7f2u6fHl/VcvF+UQdG5q1f+Q3rjvfAVXW33+q1WmDVVIgEHA5dh2tsMkB6Ljrmk+qaWiVWr2S5GeU7A/SzYsI73uwowu7A4BwtyiEof2nzvC6ry1kCpe411PweHTXI2a9Th2QZMicRCYIQlNjg+hqufq9LAWsJEqJjwzw8pTlw9OSxi9NSx6z7LWpi4e1rT0TQHXjxXd1ehPc9lYxSRDX28nOHR43ekdqeJzOB2tdI/larZg8KIOFB5uCFVluvl29BxkBQNfuo//qC9jmCCoVIHC4Ha0QfP7dGm1QD4XzLiITtAyyVR/wbjR0TrtaVVmyvMWnRCzLHoVWp4v25xfig/dfVS6VX2H5BRfqz1ziUVVVh9CROKDMzOlzy0uL/+zxyVtEUqk8SqATiSzdqNZ35nIAssIBRbKa/Vc/susSJnCSJ2o1Wri8frTU12JAiBFblr2A+NfHAbVl2P5tWe7v3l6axTnvGEBdHcexHZ9nPjd//v6nRi2e0VhxxFjrsL+jDw6K8/tdzONxM8YgExNFncEMhUPxtdhJSy4KjTUhJykVj3W1yLqRGe6qukb7hJztccCph07czgUA8ELmtDl1TkfsWWvDDCEQiFGLjDNGEAQRHIxIFBGwOxSVz8akV/8IHhuDMWe+hRierpQXnMeJA78tdqJiJedABzMQAMA45+Cco7zuyoKKxqtjvH6PKSB5uSAKCohIkTlxjwc+axWaIs0s45NZeCO+GVdj01CdkoIQ3kxStBFRQ6MXzV2/a1JHAq8dABEhY/SLc2rsXtLKYr6JCzIgKJICwWNraXTYm2z2cD3sC2ZytvljfJ0xjhcfLkTm6Y34lXdFalgrRV+tUTQzx4dsOLpvNhEBvOMQDAAa62q6602WnRGW9KuMGc2kKAqTlT0fhlRM4WljLrnWfQKWM4MraqNidHuplhmgFwKo7zYE+yuNSI7UC9HuFjldqE6JBcd1z3YMggHAmJR+e14f+8yivMKNK4jYLoNBVE3K7L7pl7Tpff6QWDQw7cD3fl+Lnxlq6lni2x94a3kQYp4djKQ4Ac1+J1q8oAGigGR1Y9zwVyYXgHiHRbgVLvw6OQfHsJFZSwY6ylzrQ/stTYgk8/NBp4TvI8fBpYpe13/JW//+4ssvd/QfaFbmHP+KWYud+CEqFTl9gEXbdfL8WT6hdNP+E3/bWjIEHQhI8RYK3SAiAPjkVFDfDd5Mo8XqJX6ossvm49NWz6IRwDBYhpJGjfp6L/K+q8d2y3BEjUrD7vzDCBFtQlmeWs5z9R+sTer806ppOU9wnnVrpfeguQmws6gIa/+1aFuaZuKur/bVX3snuSpbEZ3yD0eKWcSIUbG0cC84B8ZnjIiK35uLHhoHNFFavJRiR9XXm2C9bMPYhFjl6DEzj+ip8Y8ebRhWr93gIppquCVye78QEQg3Enf8vHlTG4TDuypPhIM8Ms4vmwCb6xpyVn6NMzEmRJZyz8RBvfybcg/QgL7xpmqKhNPuBDncSEirhlvojl89QxDSpRnLBwAXAn5/bt5J1VPjs3Y09bJU0OkTB3Pnbs27fwwAGI5Z8AwMxhjfhSkJI7otbfDbQvvKISsmbCzZxHkesuN6PdMUQ9uTY0xi8UUX1Tm0aPapuD6kCqnR4ecM+vS1B+f38cTP3THMMULMCe0ShhcnTAa0Ci5aK2G74kFiTGwed6DQ2NVQ/V7fmRvaAbQp1M5VN15yIoS/uTyPP5c+ymSt44/bagRfiwvJlefR7NQo+b5g5Yqu0x7b5jXPAkDPwcP+EhHc+fxI0XJhcda4Ewu7V39Ue6mqdzyEp41RJtRFBLCx3+JbU7X/efDbYAgVAJ5csvCUMm30Yy3mIMUnS+ya3ozHfjmG4bnbUHClK7ze33hwSgz1t4SdaI55ecgXc4bcFXC32/QtK17dNvO96wpwDpAN2LB21u5Ii6Vg8hurPr2OAXR76eV/JPeKG5k0sX/sEUUr10AjKDJDUmEhxhbuwzc/a1FeZkeU6gqGpIT7Q1N0aqN50MrPVq56l4Pfe0siuun7mwBznp2dIfPyn/fVMEie4M8TxpqrL/aMXcInjgtJ1MoY1tqofKMOZaFX6pBxaA+SSoqwviAEFZQAXesp8OBUeK4pvFtYjfzCaNnma/gi7OOd6fdVoE1xartZ8+ZbP20uqBhyplHHRf9VUZzeB30zuyGjpVEmt5uBqQg6PVJbS5G3uQDf1SSCmSMhNJcgEAC04UlgjKG12aFMTKllYTHmc9nT9vYaOxYPrAuIcw5czsXr7+/07Sr2qOxNdmXSK2ZlVIiPodbNFJWWJAXw2JuAQAC7T+px2p4Ic1gQ1NwLV815iCGJICYAROCiFoLjojRnqlv01I+bsWrrim3XXXFvCJGIsGH1a+tqJIU1lSn+nBGRmq71bmHLAadyuclIEqmhyAIUiaBwgiwaEWpRQSQJgaZScFIUEtSMkXxdUiYhoIuh4qJzSs5Qh2/VLU/fRwEA2U8/91lYGC2wuXQoLy4rLiyVmnhY5EgWYlbIUcsEZz24OhTMEA2tTgWNTg2/T1aE5gIuIUiQglJh0CvgCkHhnJNKC2o8V99QkR1NNO+BAAwc2Ll355ser2PfgFRsLTh/vLfiKxjVQ39tnU5ysxBzJ0mlMUEVHAODlqBRCZBlzo1wsoxwk0D+1iIN/DKHCM4VEIGIcxnG8LCULn/PftjZR2yrH4h+fPJWdAIAvREdM6irpA4ex0mQuN8lcnUwQEwWBVEwS/6jaWHmyqFFBTPXGhMO+TVxT4AEEHGBEUAqncgMwZoHzn67Nm0/inabEQhhnUeXSua4JMXn92u0WiKNjqlcVe6To580Ra+ZDYAjIyY967Kp2z8VnYl7Wq3cx/QsFK6zDWXb04lCHghw82BCRHekC4HAsbRnSje1p6nCYAxSq1SCSuWsEuLV7kXRa2bfgCb8XHN2d6dOYX8SG4ulOKFanhLdgEnxgZNEIQ8tTDpUvx6ePx/P5x5dL5CRpUZY8n4szN15e3vbXjJj0sjK2IQu8fkXHLBa6y+WlRxLflAKdhjgbmur+25/Bnr2nbS1Ugqa7pZFGO3lp521+f3v7tve2H1b7jlpm573GpCgRfR3Wo/dH6ohRaM39Bz7+NTxD1vjIwDc6+R8extHUdHG7Ua/eyvJCuOiXt9cWx/0sOr4EQA6ZkZLjyLutkGSJaUO6mwOQtvh5/8McF2d3kXn17oDPu7TRvFWtWWqIS5z990ZdudX/0NLs7wDOTqfmyxmyGCcQaa0fkZ77/SU1Qte/PCjO0/N4gPG+q/MktYLJna8KSLcr1b8jIk6+DSS03Dq4Jnke/X/DxWru6wKLp1RAAAAAElFTkSuQmCC","data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAmCAYAAAClI5npAAAKmUlEQVR4nLWXe1xU1RbHf2ufc2aGAYYBRkARAhUFNAUFRRQ1FZ9XElPz9tHSUm92tTTLj17tYZRlltXN7NPjZvdmVlp5NR8E+eKG+cJERA0fDO+nDAMzwzzOOfv+gSgmXeGPuz7zmc+ZOXuv9V2PvdfehC5I1pwsLD637mSL4j00cZAbPj7cnJtp+NTkL1Jjo02N7tHj2MG8Hbld0UmdG8YBEIJ6DfuHW8TjqGvKTorTjCiz6PRNLd4I8veCRiCUVNa4oIinK0p2pRD17JRm1hVaL0HwhdNht1guTTiRLzodLj/upZE8IFFWNHrZz2jQeHnxkTGRc7bdBu8yQEeTCOnpC5OcjbXJkeERWz+Ij4eX1mPgXIFOqxFVRRHzzl0Upw4Jlgf1MKDWYg3prFMdANyZlTVr1iD+/jEb/pN7dM+IgQ/PX5nWa9XbN+RSziQxTLJynb2SSisqMSBMVCtr6sUmp5obGGQ60JGujuSuEYPvn7a82VabrBWE+7r5ajMV2RYg6L1nP7Jw08OfffahUF2d/4FW592v1tqkzo43MWhFHMsvx7bNS+XCEjNz1bmznsrYPJlzDqIuAMQNGP9Sg92yTGFCoIY4nE12cChWncb3HVJd9bKijZP0fKEgaqAKpHpanMxRXc7HRoU4n5s90StxzTzAcg0ffvzr8afWvTKiSwBjJi9ZVVF2YSN3uS64ytW1pgg2u7HFOUdVwQRBJAIHYyJABDDGZUsjufQi3EP78idEvfJiqEE4YpQbr1islSveLh4AnLqn4VsAnHOYeg1uCTaYtk9Vshdtdw7Zo+MUoyHqzbkKDnBGjKngKpjI5MYGahmbCOuEJPi7GjDeXKKaCx0sZ1/udKBsD+etnJ0VNnbKokclmecV5mcv2u1JKRAlpKmqGqWqnKkq56qiQlZUIg5BrqklS3Q46l9ehahRw+BvA8qLqumqbOX9RvRa2xr2zhsHAOZtb7KkxCa9GRw9srTF3hgcC7aEeZyVVltds9PVIqhcFdxNDWiyN8A+fRSc48ZBqqmH154jaHK2oPSjDdR3XCwf4u1IfO7V98d2zTzA9uXs/OFEyeUV5HGHPDtpWhp8wpFQfjG0trbE4KPRra4vMe+wjk/htl1bVLbscYjnz3NWUcevljfAOigOxS4JlePHUZXiq+554cBhzu+9+dwBAACq09o7zCD++OynG05ojZE1uzgH58Bl868bM2aFXe4b6ktyUAR3mUyqd79QEorN5K6ohnSuEP4uJ2qNJjV07Uw2eYnpLSJCVyAYAHDZHWZzUx0B2Jv91u7WtcHRJ3HeC1/XmV55kvI8pm+/4i67gw0ZM+qG4VCO0xXoB+F0IfRXS6C1y0JmnwRFndF/pS1z2VoCbkHcC4YBQGhovw9i+sbc3L04OCcQDcPVsjOvFPhFK7uKDdKjpXlixOufZO1PnWaiMu2bNDwezu4hsqbRBreLkJD5A+mPHlFn/b1gMW9XiffaC0QAOH3y+6Wnb/7RajxmWNq4gE99ffWKRigSajyafdYqsbRw9WN/JSJEhSW5vPcfgttshkWrR6qjDImns9mG8sGyxWAIDh+p/aWMaPjenPWjt39V/tw3Wz+e9kdA1NppW9tta7Q4pk+a2rz5L8k+Ermx+KXcJzLPH/rsdnQAovgMsZvvOsXQU5bcVeIzw6x473JPuAND4O2oQHCogCWRAfVfn8vXeSSd/XzWiVvNqX1KiAj0PYAZ7V4SEfa9v26vy+qOzjxTfOqTf++a235SLD2C1Olnq0qb9cHFNhOqqhykNtfz0QkhVPBbdc51v8G9lyUjdPmEfog8c4TH+AXR+Pui6hpSonfUXThXlzlp82t3RgAATzCDzkR0mKNbe/rNLW7wvMc3W2OCVvSRLMrwiwVCWZMK7wDI5nImHj1Y+XATzDtXzJy/xoaqJZXhcth1KfjnsZPjo4ouXQnsMyZS9OTWQzGi0TXA5587otcvv1nvd7fFtnS0GedEGDIpfeP10UmrbKlDFY2XRuCltZC5BjNz9vOyq5WoHBTVONIuvPivN97Y8vyOHdBlZ7+csW3by206X9vz0SrFJAVe95hjr+cX/ynnmS86LtG2kN96SYTwKXM/dz6U/JiUMlhBi01QmRZCUACQdwkvHt2CXL8BuJKWiqH5++GTd/Fo1jvuB07h1F05/72Id7XN3/3eCWDNnD9/6Zyf/ohuYB8P3WiQFBIAWYHHYsOw62fR2OLEhQILplS+ywM81cqBq4Fjfu2urS+enWhqr+sOGBBuftq73ur2dERMKVk0OcURETzLJru7YfhAg9Q7QlWtzYwzBq4SmI8OyvUqPJP7hXrwWD2OFIUyrdgILvjAozN6DD5c8rVfzy+7fDSOOkxyG0ibZQ5wIsQuWpKpJMZMRFIcXHotZAkgh0thNqcAEsAFEYpWAK+3Yd4ve1BxMA9fXguD5OenapjAGFchiSoEUSNzUkQvhzmn9MJPo/8IQmzj4ASEv/d6QcuU8QM0gqjC6VFFi52R7CZFKwnkpQeTJLitzfC7cAmTL2fyhsIK+ua047Ix6IbTblfiVEcFJwLBPxxcbxC4oFXsbhr15Z0V9bsIcA4OwHfDpjPGvr5DUs9me+SGFknLGAQCVL0ODh8/lLu04BotYsUG9C3J58eqjeqeXJuTN5zxARFCghI+b9YYHxW8TaogQpA0epnpdCK/UVRRU/RTzz+MACeCb/r6v0XFNQ958MgRt0c1aH6RAxSuKMQ5MUNlDRL0xQh1Ejwyh8sJbDYHquUuP6FbIMtpKzITqd6MCIrTpgh6Xy5ITCSr+dqaqWl9qOin/10D82clXQomZ/R+a09e3TuGbKZAOGP7g2rKof3wOzhrdYBWAhgD0+lUg9GXWMOl8vNR2vDQrCxE9h33vkWWlnKVq9xlYxpjN3iRml12ce+Eex2Q2IIF60dX1Ull8v2rR1/4sZmd3LqJxny+Y2Ho4exr+i/2ecjux/1C/GAK8kVIdz8EB/qoWncDekj6d3tmZSF5eEZykwdLoTPKBBfz1yrb+rOGaZ0xDgB44YUtw9qeOW/7al2RCRGRNQExM9SA+IVyt8HzlW4JC9zBiYt5aFTKcQ5g99bd6BH5wM8+fR9yG6MmqhEhUetua+7coYRlZCw92TacqDUpHED4wPQ3haDgIMleLnNwQRU0jDOdxBwVV6/OSE4G56hrss18duG0EUatwhVXCz0YduXV26o7dzq9dTWjW9SEmVOWzHXI7udP2nt7mjVGSak6YVbqi86h9nJB+sC4BV4bNwIAFq+e962PRCcmDumjaXYo6o+WpE1d8b5DzLS0lVOPXyn6XvY2CXDZBL37xoGK3w5P7WgC5xzbZ8xAaXT0hfM2r/6ncg4jQ7LR3DNnOg3A2hNHBcxJP3Qqb6esNTJyO8jfac2t+O3wVAIHcX7z9NKOngjzdu9GS1XugO7CjYLuWu3XhampnTZ+hycAsPapte+MSp3LxT5p7oCI4Sp/9zbc/0vaXc85Mp6elzU5oZfsJahCg52DliO5s8XEOb+1groM0HqWB1h09MGB9/XYODm+Oxs51IdWPT1+G44f75ReIurapbA9wG0IjqlPPrnOKLnPDgrzddTVI3jld3VdVtoV+S/l++6o3W/2qQAAAABJRU5ErkJggg==","data:image/png;base64,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"],"atk":["data:image/png;base64,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","data:image/png;base64,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","data:image/png;base64,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"]};
  /* __EMBED_END__ */

  var idleC = null;            // 待机底帧 canvas（源图朝左）
  var runCs = [];              // 跑帧 canvas（4）
  var atkCs = [];              // 攻击帧 canvas（3）
  var ready = false;
  var failed = false;
  var pending = 1 + EMBED.run.length + EMBED.atk.length;
  var cache = {};              // skinId -> 帧对象（blue 不入缓存）

  /* ---------------- 基础画布工具 ---------------- */
  function mk(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function ctx2(c) { var g = c.getContext('2d'); g.imageSmoothingEnabled = false; return g; }
  function toCanvas(img) {
    var c = mk(FW, FH), g = ctx2(c);
    g.drawImage(img, 0, 0, FW, FH);
    return c;
  }
  function flipC(src) {
    var c = mk(src.width, src.height), g = ctx2(c);
    g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
    return c;
  }
  function shiftC(src, dy) {
    var c = mk(src.width, src.height), g = ctx2(c);
    g.drawImage(src, 0, dy);
    return c;
  }
  function gold(src) { // 施法金姿态：source-atop 叠金，保留透明轮廓（同 hero_anim.js goldTint）
    var c = mk(src.width, src.height), g = ctx2(c);
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 0.34; g.fillStyle = '#ffd36a';
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  /* ---------------- 调色板分区染色 ---------------- */
  function hexRgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    var l = (mx + mn) / 2, s = 0, h = 0;
    if (d > 0) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: h, s: s, l: l };
  }
  // 按源像素明度在目标色上保留明暗阶：f 为明度系数，clamp 到合理区间。
  function shade(t, l) {
    var f = 0.70 + 0.60 * l;
    return [
      Math.max(0, Math.min(255, Math.round(t[0] * f))),
      Math.max(0, Math.min(255, Math.round(t[1] * f))),
      Math.max(0, Math.min(255, Math.round(t[2] * f)))
    ];
  }
  function tint(src, pal) {
    var w = src.width, h = src.height;
    var c = mk(w, h), g = ctx2(c);
    g.drawImage(src, 0, 0);
    var img = g.getImageData(0, 0, w, h), d = img.data;
    var P = {};
    for (var k in pal) { if (Object.prototype.hasOwnProperty.call(pal, k)) P[k] = hexRgb(pal[k]); }
    for (var i = 0; i < d.length; i += 4) {
      var a = d[i + 3];
      if (a < 10) continue;
      var r = d[i], gg = d[i + 1], b = d[i + 2];
      var hslv = hsl(r, gg, b), hue = hslv.h, sat = hslv.s, l = hslv.l;
      var tgt;
      if (l < 0.20) tgt = P.k;                                   // 描边 / 黑发 / 靴
      else if (sat < 0.16 && l > 0.60) tgt = P.w;                // 白脸 / 手套 / 高光
      else if (hue < 45 || hue > 335) {                           // 暖色系 → 围巾/饰件三阶
        tgt = l < 0.34 ? P.O : (l < 0.50 ? P.o : (l < 0.65 ? P.s : P.y));
      } else if (sat < 0.16) {                                    // 中性灰 → 盔甲暗/亮
        tgt = l < 0.50 ? P.B : P.b;
      } else {                                                    // 冷色盔甲三阶
        tgt = l < 0.36 ? P.B : (l < 0.62 ? P.b : P.W);
      }
      if (!tgt) continue;
      var out = shade(tgt, l);
      d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2];
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* ---------------- 皮肤定义读取（art.js 提供 HERO_SKINS） ---------------- */
  function skinDef(id) {
    if (typeof HERO_SKINS === 'undefined' || !Array.isArray(HERO_SKINS)) return null;
    for (var i = 0; i < HERO_SKINS.length; i++) if (HERO_SKINS[i].id === id) return HERO_SKINS[i];
    return null;
  }

  /* ---------------- 帧集组装 ---------------- */
  function buildFrames(sk) {
    var pal = sk.pal;
    var R = flipC(idleC), L = idleC;
    var up = shiftC(R, -1), dn = shiftC(R, 1);
    var run = [runCs[0], runCs[1], runCs[2], runCs[3], runCs[0], runCs[1]]; // 对齐旧契约 6 帧
    var atk = atkCs[1] || atkCs[0];
    var atkGoldSrc = gold(atkCs[2] || atkCs[1] || atk);
    function T(src) { return tint(src, pal); }

    var f = {
      idle1: T(R), idle2: T(dn),
      run: run.map(T),
      jump: T(up), fall: T(dn),
      attack: T(atk), dash: T(R), squash: T(dn), dashWind: T(dn),
      attackGold: T(atkGoldSrc),
      attackFrames: atkCs.map(T),
      idle1L: T(flipC(R)), idle2L: T(flipC(dn)),
      runL: run.map(function (x) { return T(flipC(x)); }),
      jumpL: T(flipC(up)), fallL: T(flipC(dn)),
      attackL: T(flipC(atk)), dashL: T(flipC(R)),
      squashL: T(flipC(dn)), dashWindL: T(flipC(dn)),
      attackGoldL: T(flipC(atkGoldSrc)),
      attackFramesL: atkCs.map(function (x) { return T(flipC(x)); })
    };
    f.cast = f.attackGold; f.castL = f.attackGoldL;   // 施法态别名（验收状态键）
    f.die = f.fall; f.dieL = f.fallL;                // 死亡态别名
    return f;
  }

  function frames(id) {
    if (!ready || failed) return null;
    var sk = skinDef(id);
    if (!sk || sk.id === 'blue') return null;
    if (cache[sk.id]) return cache[sk.id];
    var f = buildFrames(sk);
    cache[sk.id] = f;
    return f;
  }

  /* ---------------- 永久守卫 ---------------- */
  var skinWrapped = false;
  function wrapGetHeroSkin() {
    if (skinWrapped || typeof window.getHeroSkin !== 'function') return;
    var orig = window.getHeroSkin;
    var fn = function (id) {
      var d = skinDef(id);
      if (d && d.id !== 'blue' && cache[d.id]) return cache[d.id];
      return orig.apply(this, arguments);
    };
    fn.__pqHeroSkinAI = true;
    // 带上既有包装标记：避免 hero_anim / ai_style 的定时重压再次外包把本层挤掉。
    fn.__pqHeroAnim = true;
    fn.__pqStyle = true;
    window.getHeroSkin = fn;
    skinWrapped = true;
  }

  // 顶层 hero* 源帧（与 ai_sprites/hero_anim 同一套 AI 源），看门狗检测到回流时复位。
  function topLevelSources() {
    if (!idleC) return null;
    var R = flipC(idleC), up = shiftC(R, -1), dn = shiftC(R, 1);
    var run = runCs.length ? runCs.slice() : [R, R, R, R, R, R];
    var atk = atkCs[1] || atkCs[0] || R;
    return {
      heroIdle1: R, heroIdle2: dn, heroJump: up, heroFall: dn,
      heroAttack: atk, heroDash: R, heroSquash: dn, heroDashWind: dn,
      heroRun: run,
      heroIdle1L: idleC, heroIdle2L: shiftC(idleC, 1), heroJumpL: shiftC(idleC, -1),
      heroFallL: shiftC(idleC, 1), heroAttackL: flipC(atk), heroDashL: idleC,
      heroSquashL: shiftC(idleC, 1), heroDashWindL: shiftC(idleC, 1),
      heroRunL: run.map(flipC)
    };
  }

  function frameSize(v) {
    var c = Array.isArray(v) ? v[0] : v;
    return (c && typeof c.width === 'number' && c.width > 0) ? { w: c.width, h: c.height } : null;
  }

  function watchdog() {
    if (typeof SPR === 'undefined' || !SPR) return;
    // ① 皮肤缓存：被删/被覆盖 → 按描述符复位（不可写描述符本身已挡，这里兜底 identify 漂移）
    for (var id in cache) {
      if (!Object.prototype.hasOwnProperty.call(cache, id)) continue;
      if (SPR.skins && SPR.skins[id] !== cache[id]) {
        try { Object.defineProperty(SPR.skins, id, { value: cache[id], writable: false, configurable: false, enumerable: true }); }
        catch (e) { SPR.skins[id] = cache[id]; }
      }
    }
    // ② 顶层 hero*：回流到 16×16 / 缺帧 → 用 AI 源帧复位（只认尺寸，不碰敌人/Boss 帧）
    var src = topLevelSources();
    if (!src) return;
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      var cur = SPR[k], sz = frameSize(cur);
      var want = frameSize(src[k]);
      if (!want) continue;
      if (!sz || sz.w !== want.w || sz.h !== want.h) {
        try { SPR[k] = src[k]; } catch (e) {}
      }
    }
  }

  function installGuard() {
    if (typeof SPR === 'undefined' || !SPR) return;
    if (!SPR.skins) SPR.skins = {};
    wrapGetHeroSkin(); // 先外包取帧层，再装描述符；任一套失败不影响其余守卫
    var defs = (typeof HERO_SKINS !== 'undefined' && Array.isArray(HERO_SKINS)) ? HERO_SKINS : [];
    for (var i = 0; i < defs.length; i++) {
      var id = defs[i].id;
      if (id === 'blue') continue;
      try {
        var f = frames(id);
        if (!f) continue;
        Object.defineProperty(SPR.skins, id, { value: f, writable: false, configurable: false, enumerable: true });
      } catch (e) { try { SPR.skins[id] = frames(id); } catch (e2) {} }
    }
    watchdog();
    // 常驻看门狗：不设截止时间（区别于 ai_sprites/hero_anim 的 12 秒定时重压）。
    setInterval(watchdog, 1000);
  }

  /* ---------------- 内嵌源帧解码 ---------------- */
  function loaded() {
    pending--;
    if (pending > 0) return;
    if (failed) return;
    ready = true;
    try { installGuard(); } catch (e) { /* 守卫安装失败不影响回退链路 */ }
  }
  function loadData(store, idx, uri) {
    if (!uri) { failed = true; loaded(); return; }
    var im = new Image();
    im.onload = function () { store[idx] = toCanvas(im); loaded(); };
    im.onerror = function () { failed = true; loaded(); };
    im.src = uri;
  }

  loadData(runCs, 0, EMBED.run[0]); loadData(runCs, 1, EMBED.run[1]);
  loadData(runCs, 2, EMBED.run[2]); loadData(runCs, 3, EMBED.run[3]);
  loadData(atkCs, 0, EMBED.atk[0]); loadData(atkCs, 1, EMBED.atk[1]); loadData(atkCs, 2, EMBED.atk[2]);
  (function () {
    if (!EMBED.idle || !EMBED.idle[0]) { failed = true; loaded(); return; }
    var im = new Image();
    im.onload = function () { idleC = toCanvas(im); loaded(); };
    im.onerror = function () { failed = true; loaded(); };
    im.src = EMBED.idle[0];
  })();

  window.PQ_HERO_SKIN_AI = {
    ready: false,
    frames: frames,
    version: 'v54'
  };
  Object.defineProperty(window.PQ_HERO_SKIN_AI, 'ready', {
    get: function () { return ready; },
    set: function () { /* 只读：以内部加载状态为准 */ }
  });
})();
