# How to

##### Install dependencies

```shell
$ sudo dnf5 group install "development-tools"
$ sudo dnf builddep kwin
```



##### Compile and install `kwin`

```shell
$ kwin_wayland --version
$ git checkout customize/v<x.y.z>
$ mkdir build
$ cd build
$ cmake ..
$ make -j$(nproc)
$ sudo make install
```





# Customization

##### Disable natural swiping

There is no UI to disable the natural direction swiping



##### Interpret three-fingers gestures as navigation

There is no UI to configure the functionality of gestures



##### Bring back shading

This is part of an effort to bring back the Mac OS 9 desktop environment



##### Bring back hide

This is part of an effort to bring back the Mac OS 9 desktop environment

